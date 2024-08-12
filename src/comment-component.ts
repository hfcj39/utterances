import { IssueComment } from "./gitlab";
import { timeAgo } from "./time-ago";
import { scheduleMeasure } from "./measure";
import {
  getReactionsMenuHtml,
  getReactionHtml,
  getSignInToReactMenuHtml,
} from "./reactions";
import { UTTERANCES_API } from "./config";


export class CommentComponent {
  public readonly element: HTMLElement;

  constructor(
    public comment: IssueComment,
    private currentUser: string | null,
    confidential: boolean
  ) {
    const { author, created_at, body } = comment;
    this.element = document.createElement("article");
    this.element.classList.add("timeline-comment");
    if (author != undefined && author.username === currentUser) {
      this.element.classList.add("current-user");
    }

    let headerReactionsMenu = "";
    let footerReactionsMenu = "";
    if (!confidential) {
      if (currentUser) {
        headerReactionsMenu = getReactionsMenuHtml(comment.id, "right"); // 这里假设有某种方式获取 reactions URL
        footerReactionsMenu = getReactionsMenuHtml(comment.id, "center");
      } else {
        headerReactionsMenu = getSignInToReactMenuHtml("right");
        footerReactionsMenu = getSignInToReactMenuHtml("center");
      }
    }

    this.element.innerHTML = `
      <a class="avatar" href="${author.web_url}" target="_blank" tabindex="-1">
        <img alt="@${author.username}" height="44" width="44"
              src="${UTTERANCES_API}/avatar/${author.username}">
      </a>
      <div class="comment">
        <header class="comment-header">
          <span class="comment-meta">
            <a class="text-link" href="${
              author.web_url
            }" target="_blank"><strong>${author.username}</strong></a>
            commented
            <a class="text-link" href="${
              comment.web_url
            }" target="_blank">${timeAgo(Date.now(), new Date(created_at))}</a>
          </span>
          <div class="comment-actions">
            
          </div>
        </header>
        <div class="markdown-body markdown-body-scrollable">
          ${body}
        </div>
        <div class="comment-footer" reaction-count="0" reaction-url="">
          ${footerReactionsMenu}
        </div>
      </div>`;

    const markdownBody = this.element.querySelector(".markdown-body")!;
    const emailToggle = markdownBody.querySelector(
      ".email-hidden-toggle a"
    ) as HTMLAnchorElement;
    if (emailToggle) {
      const emailReply = markdownBody.querySelector(
        ".email-hidden-reply"
      ) as HTMLDivElement;
      emailToggle.onclick = (event) => {
        event.preventDefault();
        emailReply.classList.toggle("expanded");
      };
    }

    processRenderedMarkdown(markdownBody);
  }

  public setCurrentUser(currentUser: string | null) {
    if (this.currentUser === currentUser) {
      return;
    }
    this.currentUser = currentUser;

    if (this.comment.author.username === this.currentUser) {
      this.element.classList.add("current-user");
    } else {
      this.element.classList.remove("current-user");
    }
  }
}

export function processRenderedMarkdown(markdownBody: Element) {
  Array.from(
    markdownBody.querySelectorAll<HTMLAnchorElement>(
      ":not(.email-hidden-toggle) > a"
    )
  ).forEach((a) => {
    a.target = "_top";
    a.rel = "noopener noreferrer";
  });
  Array.from(markdownBody.querySelectorAll<HTMLImageElement>("img")).forEach(
    (img) => (img.onload = scheduleMeasure)
  );
}
