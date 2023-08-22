import * as R from "remeda";
import { isBefore, parseISO, subMonths } from "date-fns";
import { octokit } from "./common/octokit.ts";
import { postBlocks } from "./common/slack.ts";

type RepoNodes = {
  name: string;
  isArchived: boolean;
  pushedAt: string;
  url: string;
};

const getTeamReposQuery = /* GraphQL */ `
  query OurRepos($team: String!) {
    organization(login: "navikt") {
      team(slug: $team) {
        repositories {
          nodes {
            name
            isArchived
            pushedAt
            url
          }
        }
      }
    }
  }
`;

async function getRepositories(
  team: string,
): Promise<{ name: string; lastPush: Date; url: string }[]> {
  console.info(`Getting repositories for team ${team}`);

  const queryResult = (await octokit.graphql(getTeamReposQuery, {
    team,
  })) as any;

  const threeMonthsAgo = subMonths(new Date(), 3);
  const repos = R.pipe(
    queryResult.organization.team.repositories.nodes as RepoNodes[],
    R.filter((it) => !it.isArchived),
    R.map((repo) => ({
      name: repo.name,
      lastPush: parseISO(repo.pushedAt),
      url: repo.url,
    })),
    R.filter((it) => isBefore(it.lastPush, threeMonthsAgo)),
    R.sortBy((it) => it.lastPush),
  );

  console.info(`Got ${repos.length} repositories for team ${team}`);
  console.log(repos);

  return repos;
}

const ancientRepos = await getRepositories("teamsykmelding");

if (ancientRepos.length === 0) {
  console.info("Found no ancient repos");
  process.exit(0);
}

await postBlocks([
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Fant ${ancientRepos.length} repo som ikke har fått noen commits på 3 måneder. Noe som burde oppdateres eller arkiveres?`,
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: ancientRepos.map((it) => `- ${it.name}: ${it.url}`).join("\n"),
    },
  },
]);
