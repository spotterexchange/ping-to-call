import type { Sender } from "../types";

/**
 * Build the Power Automate "Condition" expression that forwards an event ONLY
 * when the sender is on the user's list. This runs inside the user's own tenant,
 * so only matching senders' metadata ever reaches our /ingest endpoint.
 *
 * Users paste this into the flow's Condition (expression mode). It compares the
 * message sender's email (and display name as a fallback) against their list.
 */
export function buildFlowCondition(senders: Sender[]): string {
  const enabled = senders.filter((s) => s.enabled);
  const emails = enabled
    .map((s) => (s.email || "").trim().toLowerCase())
    .filter(Boolean);
  const names = enabled
    .map((s) => (s.display_name || "").trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0 && names.length === 0) {
    return "false"; // no senders configured → forward nothing
  }

  const emailExpr = "toLower(coalesce(triggerBody()?['from']?['user']?['email'], ''))";
  const nameExpr = "toLower(coalesce(triggerBody()?['from']?['user']?['displayName'], ''))";

  const clauses: string[] = [];
  for (const e of emails) clauses.push(`equals(${emailExpr}, '${escapeExpr(e)}')`);
  for (const n of names) clauses.push(`equals(${nameExpr}, '${escapeExpr(n)}')`);

  // Power Automate's or() takes exactly two args; nest for N clauses.
  return clauses.reduce((acc, c) => (acc ? `or(${acc}, ${c})` : c));
}

function escapeExpr(s: string): string {
  // Single quotes are escaped by doubling in Power Automate expressions.
  return s.replace(/'/g, "''");
}

/** The JSON body the flow's HTTP action should POST — metadata only, no content. */
export function ingestBodyTemplate(): string {
  return JSON.stringify(
    {
      sender: "@{triggerBody()?['from']?['user']?['displayName']}",
      senderEmail: "@{triggerBody()?['from']?['user']?['email']}",
      isMention: false,
      isDirectMessage: true,
      messageId: "@{triggerBody()?['id']}",
      timestamp: "@{triggerBody()?['createdDateTime']}",
    },
    null,
    2,
  );
}
