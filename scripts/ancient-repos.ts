import * as R from "remeda";
import { isBefore, parseISO, subMonths, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
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
    R.reverse(),
  );

  console.info(`Got ${repos.length} repositories for team ${team}`);

  return repos;
}

const ancientRepos = await getRepositories("teamsykmelding");

if (ancientRepos.length === 0) {
  console.info("Found no ancient repos");
  process.exit(0);
}

await postBlocks([
  {
    type: "header",
    text: {
      type: "plain_text",
      text: `Fant ${ancientRepos.length} repo som ikke har fått noen commits på 3 måneder. Noe som burde oppdateres eller arkiveres?`,
      emoji: true,
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: ancientRepos
        .map(
          (it) =>
            `- <${it.url}|${it.name}> (${formatDistanceToNow(it.lastPush, {
              locale: nb,
            })})`,
        )
        .join("\n"),
    },
  },
]);
