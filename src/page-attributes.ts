function readPageAttributes() {
  const params = Object.fromEntries(
    new URL(location.href).searchParams.entries()
  );

  let issueTerm: string | null = null;
  let issueNumber: number | null = null;
  if ("issue-term" in params) {
    issueTerm = params["issue-term"];
    if (issueTerm !== undefined) {
      if (issueTerm === "") {
        throw new Error("When issue-term is specified, it cannot be blank.");
      }
      if (["title", "url", "pathname", "og:title"].indexOf(issueTerm) !== -1) {
        if (!params[issueTerm]) {
          throw new Error(`Unable to find "${issueTerm}" metadata.`);
        }
        issueTerm = params[issueTerm];
      }
    }
  } else if ("issue-number" in params) {
    issueNumber = +params["issue-number"];
    if (issueNumber.toString(10) !== params["issue-number"]) {
      throw new Error(`issue-number is invalid. "${params["issue-number"]}`);
    }
  } else {
    throw new Error('"issue-term" or "issue-number" must be specified.');
  }

  if (!("projectid" in params)) {
    throw new Error('"projectid" is required.');
  }

  if (!("origin" in params)) {
    throw new Error('"origin" is required.');
  }

  const projectId = +params.projectid;
  if (isNaN(projectId)) {
    throw new Error(`Invalid projectid: "${params.projectid}"`);
  }

  return {
    projectId,
    issueTerm,
    issueNumber,
    origin: params.origin,
    url: params.url,
    title: params.title,
    description: params.description,
    label: params.label,
    theme: params.theme || "github-light",
    session: params.session,
  };
}

export const pageAttributes = readPageAttributes();
