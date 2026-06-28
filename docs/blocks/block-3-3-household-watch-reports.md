# Block 3-3: Household Watch Reports

## Context
Now that watch history intelligence (Phase 2) is complete, `plex-cowatcher` can assemble highly detailed views of what the household watched, which sessions were co-watched, and who watched what. We should automate the delivery of this intelligence.

## Acceptance Criteria

- [ ] **Report Generator**: Create a service module capable of generating a clean text or markdown report summarizing a given time range (e.g. 7 days).
- [ ] **Co-watch Highlights**: Ensure the report specifically calls out group viewing sessions.
- [ ] **Discord Delivery**: Send the generated report to the configured Discord channel.
- [ ] **Scheduled Trigger**: Use a cron job or scheduled task to automatically run the report generator at a specified interval (e.g., Sunday mornings).
