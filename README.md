# teamsykmelding-slack-reminders

Et sett med cron-jobber som sjekker diverse ting og sender påminnelser til #teamsymelding-påminnelser på slack.

Liste over påminnelser og når de kjøres:

<!-- COMPUTER SAYS DON'T TOUCH THIS START -->

- **Gamle pull requests** | Kl.10:15, på tirsdag og fredag
- **Repos med feil i CODEOWNERS** | Kl.06:45, på torsdag
- **Sjekk sårbarheter daglig for CRITICAL og HIGH** | Kl.07:03, hver dag
- **Sjekk sårbarheter ukentlig for MODERATE og LOW** | Kl.10:10, på fredag
- **Urørte repositories** | Kl.08:15, på onsdag

<!-- COMPUTER SAYS DON'T TOUCH THIS END -->

## Utvikling

Du må ha https://bun.sh for å kjøre dette lokalt.

Installer avhengigheter:

```bash
bun install
```

Opprett en `.env`-fil hvor du kan legge in Github `READER_TOKEN` og `SLACK_WEBHOOK_URL` for å utvikle lokalt dersom du ønsker det.

For å kjøre script:

```bash
bun run scripts/ditt-script.ts
```
