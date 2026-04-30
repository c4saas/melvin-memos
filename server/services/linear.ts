/**
 * Linear outbound — creates issues via Linear's GraphQL API.
 * Docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('linear');
const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';

async function linearGraphQL<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const resp = await fetch(LINEAR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,        // Linear uses raw key, not Bearer prefix
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    throw new Error(`Linear API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const body = await resp.json() as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new Error(body.errors.map(e => e.message).join('; '));
  }
  if (!body.data) throw new Error('Linear: empty response');
  return body.data;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export async function listTeams(): Promise<LinearTeam[]> {
  const s = await getSettings();
  const apiKey = (s as any).integrations?.linear?.apiKey;
  if (!apiKey) throw new Error('Linear API key not configured');
  const data = await linearGraphQL<{ teams: { nodes: LinearTeam[] } }>(
    apiKey,
    `query { teams { nodes { id name key } } }`,
  );
  return data.teams.nodes;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  teamId?: string;
  projectId?: string;
  priority?: 0 | 1 | 2 | 3 | 4; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
}

export interface CreateIssueResult {
  issueId: string;
  identifier: string;
  url: string;
}

export async function createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
  const s = await getSettings();
  const cfg = (s as any).integrations?.linear ?? {};
  const apiKey = cfg.apiKey;
  if (!apiKey) throw new Error('Linear API key not configured');

  const teamId = input.teamId ?? cfg.teamId;
  if (!teamId) throw new Error('Linear team ID not configured (add one in Settings)');

  const mutation = `
    mutation ($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url title }
      }
    }
  `;

  const data = await linearGraphQL<{
    issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } };
  }>(apiKey, mutation, {
    input: {
      teamId,
      title: input.title.slice(0, 255),
      description: input.description?.slice(0, 100_000),
      projectId: input.projectId ?? cfg.defaultProjectId ?? undefined,
      priority: input.priority ?? 0,
    },
  });

  if (!data.issueCreate.success) throw new Error('Linear rejected the issue');
  log.info('linear issue created', {
    id: data.issueCreate.issue.id,
    identifier: data.issueCreate.issue.identifier,
  });
  return {
    issueId: data.issueCreate.issue.id,
    identifier: data.issueCreate.issue.identifier,
    url: data.issueCreate.issue.url,
  };
}
