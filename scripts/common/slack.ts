const WEBHOOK_URL = Bun.env.SLACK_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.error("READER_TOKEN is not set");
  process.exit(1);
}

export async function postBlocks(blocks: any[]) {
  const result = await fetch(WEBHOOK_URL as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      blocks,
    }),
  });

  if (result.ok) {
    console.info("Posted to Slack OK");
    process.exit(0);
  } else {
    console.error(
      `Failed to post to Slack, ${result.status} ${result.statusText}`,
    );
    console.error(result.text());
    process.exit(1);
  }
}
