import { pageAttributes as page } from "./page-attributes";
import {
  Issue,
  setRepoContext,
  loadIssueByTerm,
  loadIssueByNumber,
  loadCommentsPage,
  loadUser,
  postComment,
  createIssue,
  PAGE_SIZE,
  IssueComment,
} from "./gitlab";
import { TimelineComponent } from "./timeline-component";
import { NewCommentComponent } from "./new-comment-component";
import { startMeasuring, scheduleMeasure } from "./measure";
import { loadTheme } from "./theme";
import { getRepoConfig } from "./repo-config";
import { loadToken } from "./oauth";
import { enableReactions } from "./reactions";
import { system_avatar_url, GITLAB_API } from "./config"

setRepoContext({ projectId: page.projectId });

function loadIssue(): Promise<Issue | null> {
  if (page.issueNumber !== null) {
    return loadIssueByNumber(page.issueNumber);
  }
  return loadIssueByTerm(page.issueTerm as string);
}

async function bootstrap() {
  await loadToken();
  let [issue, user] = await Promise.all([
    loadIssue(),
    loadUser(),
    loadTheme(page.theme, page.origin),
  ]);

  startMeasuring(page.origin);

  const timeline = new TimelineComponent(user, issue);
  document.body.appendChild(timeline.element);

  if (issue && issue.user_notes_count > 0) {
    renderComments(issue, timeline);
  }

  scheduleMeasure();

  if (issue && issue.confidential) {
    return;
  }

  enableReactions(!!user);

  const submit = async (markdown: string) => {
    await assertOrigin();
    if (!issue) {
      issue = await createIssue(
        page.issueTerm as string,
        page.url,
        page.title,
        page.description || "",
        page.label
      );
      timeline.setIssue(issue);
    }
    const comment = await postComment(issue.iid, markdown);
    timeline.insertComment(comment, true);
    newCommentComponent.clear();
  };

  const newCommentComponent = new NewCommentComponent(user, submit);
  timeline.element.appendChild(newCommentComponent.element);
}

bootstrap();

addEventListener("not-installed", function handleNotInstalled() {
  removeEventListener("not-installed", handleNotInstalled);
  document.querySelector(".timeline")!.insertAdjacentHTML(
    "afterbegin",
    `
  <div class="flash flash-error">
    Error: utterances is not installed on <code>${page.projectId}</code>.
    If you own this project,
    <a href="${GITLAB_API}"><strong>install the app</strong></a>.
    Read more about this change in
    <a href="${GITLAB_API}"><target="_top">the PR</a>.
  </div>`
  );
  scheduleMeasure();
});

async function renderComments(issue: Issue, timeline: TimelineComponent) {
  const renderPage = (page: IssueComment[]) => {
    for (const comment of page) {
      timeline.insertComment(comment, false);
    }
  };

  const pageCount = Math.ceil(issue.user_notes_count / PAGE_SIZE);
  const pageLoads = [loadCommentsPage(issue.iid, 1)];
  if (pageCount > 1) {
    pageLoads.push(loadCommentsPage(issue.iid, pageCount));
  }
  if (
    pageCount > 2 &&
    issue.user_notes_count % PAGE_SIZE < 3 &&
    issue.user_notes_count % PAGE_SIZE !== 0
  ) {
    pageLoads.push(loadCommentsPage(issue.iid, pageCount - 1));
  }

  try {
    const pages = await Promise.all(pageLoads);
    for (const page of pages) {
      renderPage(page);
    }
    let hiddenPageCount = pageCount - pageLoads.length;
    let nextHiddenPage = 2;
    const renderLoader = (afterPage: IssueComment[]) => {
      if (hiddenPageCount === 0) {
        return;
      }
      const load = async () => {
        loader.setBusy();
        try {
          const page = await loadCommentsPage(issue.iid, nextHiddenPage);
          loader.remove();
          renderPage(page);
          hiddenPageCount--;
          nextHiddenPage++;
          renderLoader(page);
        } catch (error) {
          if (error.message === "401 Unauthorized") {
            displayLoginPrompt(timeline);
          }
        }
      };
      const afterComment = afterPage.pop()!;
      const loader = timeline.insertPageLoader(
        afterComment,
        hiddenPageCount * PAGE_SIZE,
        load
      );
    };
    renderLoader(pages[0]);
  } catch (error) {
    if (error.message === "401 Unauthorized") {
      displayLoginPrompt(timeline);
    }
  }
}

function displayLoginPrompt(timeline: TimelineComponent) {
  const loginPrompt = {
    id: Date.now(),
    body: `You need to log in to view comments.`,
    author: {
      username: "system",
      avatar_url: system_avatar_url,
      web_url: "#",
    },
    created_at: new Date().toISOString(),
  };
  timeline.insertComment(loginPrompt as any, false);
}

export async function assertOrigin() {
  const { origins } = await getRepoConfig();
  const { origin } = page;
  if (origins.indexOf(origin) !== -1) {
    return;
  }

  document.querySelector(".timeline")!.lastElementChild!.insertAdjacentHTML(
    "beforebegin",
    `
  <div class="flash flash-error flash-not-installed">
    Error: <code>${origin}</code> is not permitted to post to <code>${
      page.projectId
    }</code>.
    Confirm this is the correct project for this site's comments. If you own this project,
    <a href="${GITLAB_API}/${
      page.projectId
    }/edit/master/utterances.json" target="_top">
      <strong>update the utterances.json</strong>
    </a>
    to include <code>${origin}</code> in the list of origins.<br/><br/>
    Suggested configuration:<br/>
    <pre><code>${JSON.stringify({ origins: [origin] }, null, 2)}</code></pre>
  </div>`
  );
  scheduleMeasure();
  throw new Error("Origin not permitted.");
}
