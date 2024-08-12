import { token } from "./oauth";
import { decodeBase64UTF8 } from "./encoding";
import { GITLAB_API, UTTERANCES_API } from "./config";

export const PAGE_SIZE = 25;

export type ReactionID =
  | "thumbsup"
  | "thumbsdown"
  | "laugh"
  | "hooray"
  | "confused"
  | "heart"
  | "rocket"
  | "eyes";

export const reactionTypes: ReactionID[] = [
  "thumbsup",
  "thumbsdown",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];

let projectId: number;

export function setRepoContext(context: { projectId: number }) {
  projectId = context.projectId;
}

function gitlabRequest(relativeUrl: string, init?: RequestInit) {
  init = init || {};
  init.mode = "cors";
  init.cache = "no-cache"; // force conditional request
  const request = new Request(GITLAB_API + relativeUrl, init);
  request.headers.set("Authorization", `Bearer ${token.value}`);
  return request;
}

const rateLimit = {
  standard: {
    limit: Number.MAX_VALUE,
    remaining: Number.MAX_VALUE,
    reset: 0,
  },
  search: {
    limit: Number.MAX_VALUE,
    remaining: Number.MAX_VALUE,
    reset: 0,
  },
};

function processRateLimit(response: Response) {
  const limit = response.headers.get("RateLimit-Limit")!;
  const remaining = response.headers.get("RateLimit-Remaining")!;
  const reset = response.headers.get("RateLimit-Reset")!;

  const isSearch = /\/search\//.test(response.url);
  const rate = isSearch ? rateLimit.search : rateLimit.standard;

  rate.limit = +limit;
  rate.remaining = +remaining;
  rate.reset = +reset;

  if (response.status === 403 && rate.remaining === 0) {
    const resetDate = new Date(0);
    resetDate.setUTCSeconds(rate.reset);
    const mins = Math.round(
      (resetDate.getTime() - new Date().getTime()) / 1000 / 60
    );
    const apiType = isSearch ? "search API" : "non-search APIs";
    // tslint:disable-next-line:no-console
    console.warn(
      `Rate limit exceeded for ${apiType}. Resets in ${mins} minute${
        mins === 1 ? "" : "s"
      }.`
    );
  }
}

export function readRelNext(response: Response) {
  const link = response.headers.get("link");
  if (link === null) {
    return 0;
  }
  const match = /\?page=([2-9][0-9]*)>; rel="next"/.exec(link);
  if (match === null) {
    return 0;
  }
  return +match[1];
}

function gitlabFetch(request: Request): Promise<Response> {
  return fetch(request).then((response) => {
    if (response.status === 401) {
      token.value = null;
    }
    if (response.status === 403) {
      response.json().then((data) => {
        if (data.message === "Resource not accessible by integration") {
          window.dispatchEvent(new CustomEvent("not-installed"));
        }
      });
    }

    processRateLimit(response);

    if (
      request.method === "GET" &&
      [401, 403].indexOf(response.status) !== -1 &&
      request.headers.has("Authorization")
    ) {
      request.headers.delete("Authorization");
      return gitlabFetch(request);
    }
    return response;
  });
}

export function loadJsonFile<T>(path: string) {
  const request = gitlabRequest(
    `projects/${projectId}/repository/files/${encodeURIComponent(
      path
    )}/raw?ref=master`
  );
  return gitlabFetch(request)
    .then((response) => {
      if (response.status === 404) {
        throw new Error(
          `Project "${projectId}" does not have a file named "${path}" in the "master" branch.`
        );
      }
      if (!response.ok) {
        throw new Error(`Error fetching ${path}.`);
      }
      return response.text();
    })
    .then((content) => {
      const decoded = decodeBase64UTF8(content);
      return JSON.parse(decoded) as T;
    });
}

export function loadIssueByTerm(term: string) {
  const q = `${term}`;
  const request = gitlabRequest(
    `projects/${projectId}/issues?search=${encodeURIComponent(
      q
    )}&order_by=created_at&sort=asc`
  );
  return gitlabFetch(request)
    .then<IssueSearchResponse>((response) => {
      if (!response.ok) {
        throw new Error("Error fetching issue via search.");
      }
      return response.json();
    })
    .then((results) => {
      if (results.length === 0) {
        return null;
      }
      if (results.length > 1) {
        // tslint:disable-next-line:no-console
        console.warn(`Multiple issues match "${q}".`);
      }
      term = term.toLowerCase();
      for (const result of results) {
        if (result.title.toLowerCase().indexOf(term) !== -1) {
          return result;
        }
      }
      // tslint:disable-next-line:no-console
      console.warn(
        `Issue search results do not contain an issue with title matching "${term}". Using first result.`
      );
      return results[0];
    });
}

export function loadIssueByNumber(issueNumber: number) {
  const request = gitlabRequest(`projects/${projectId}/issues/${issueNumber}`);
  return gitlabFetch(request).then<Issue>((response) => {
    if (!response.ok) {
      throw new Error("Error fetching issue via issue number.");
    }
    return response.json();
  });
}

function commentsRequest(issueNumber: number, page: number) {
  const url = `projects/${projectId}/issues/${issueNumber}/notes?page=${page}&per_page=${PAGE_SIZE}`;
  const request = gitlabRequest(url);
  return request;
}

export function loadCommentsPage(
  issueNumber: number,
  page: number
): Promise<IssueComment[]> {
  const request = commentsRequest(issueNumber, page);
  return gitlabFetch(request).then((response) => {
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("401 Unauthorized");
      }
      throw new Error("Error fetching comments.");
    }
    return response.json();
  });
}

export function loadUser(): Promise<User | null> {
  if (token.value === null) {
    return Promise.resolve(null);
  }
  return gitlabFetch(gitlabRequest("user")).then((response) => {
    if (response.ok) {
      return response.json();
    }
    return null;
  });
}

export function createIssue(
  issueTerm: string,
  documentUrl: string,
  title: string,
  description: string,
  label: string
) {
  const url = `${UTTERANCES_API}/projects/${projectId}/issues`;
  const request = new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      description: `# ${title}\n\n${description}\n\n[${documentUrl}](${documentUrl})`,
      labels: label ? [label] : [],
    }),
  });
  request.headers.set("Authorization", `Bearer ${token.value}`);
  return fetch(request).then<Issue>((response) => {
    if (!response.ok) {
      throw new Error("Error creating issue.");
    }
    return response.json();
  });
}

export function postComment(issueNumber: number, markdown: string) {
  const url = `projects/${projectId}/issues/${issueNumber}/notes`;
  const body = JSON.stringify({ body: markdown });
  const request = gitlabRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
  return gitlabFetch(request).then<IssueComment>((response) => {
    if (!response.ok) {
      throw new Error("Error posting comment.");
    }
    return response.json();
  });
}

export async function toggleReaction(url: string, content: ReactionID) {
  url = url.replace(GITLAB_API, "");
  const body = JSON.stringify({ name: content });
  const postRequest = gitlabRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
  const response = await gitlabFetch(postRequest);
  const reaction: Reaction = response.ok ? await response.json() : null;
  if (response.status === 201) {
    // reaction created.
    return { reaction, deleted: false };
  }
  if (response.status !== 200) {
    throw new Error(
      'expected "201 reaction created" or "200 reaction already exists"'
    );
  }
  // reaction already exists... delete.
  const deleteRequest = gitlabRequest(`${url}/${reaction.id}`, {
    method: "DELETE",
  });
  await gitlabFetch(deleteRequest);
  return { reaction, deleted: true };
}

export function renderMarkdown(text: string) {
  const body = JSON.stringify({ text, gfm: true });
  return gitlabFetch(
    gitlabRequest("markdown", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    })
  ).then((response) => response.text());
}

interface IssueSearchResponse extends Array<Issue> {}

interface IssueSearchResponse {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: string[];
  milestone: any;
  assignees: User[];
  author: User;
  type: string;
  user_notes_count: number;
  merge_requests_count: number;
  upvotes: number;
  downvotes: number;
  due_date: string | null;
  confidential: boolean;
  discussion_locked: boolean;
  issue_type: string;
  task_completion_status: {
    count: number;
    completed_count: number;
  };
  weight: number | null;
  health_status: string | null;
}

export interface User {
  id: number;
  name: string;
  username: string;
  state: string;
  avatar_url: string;
  web_url: string;
}

export interface Reaction {
  id: number;
  name: ReactionID;
  user: User;
  created_at: string;
}

export interface Issue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: string[];
  milestone: any;
  assignees: User[];
  author: User;
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  due_date: string | null;
  confidential: boolean;
  discussion_locked: boolean;
}

export interface IssueComment {
  id: number;
  body: string;
  author: User;
  created_at: string;
  updated_at: string;
}

interface FileContentsResponse {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}
