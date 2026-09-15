# Security reporting

For company questions and support, email **contact@Unays.net**.

Report vulnerabilities privately to **security@unays.net** with a description, affected version, minimal reproduction steps, and expected impact. Do not include other people's personal data or usable credentials.

Do not post unpatched vulnerabilities or secrets in public issues. We will review reports and coordinate fixes. This first community release has not undergone an independent security audit.

Test your own local instance. Production testing requires prior written authorization and a clearly agreed scope. Do not run high-volume, destructive, or disruptive tests against unays.net or other community installations.

Keep `.env`, `data/`, private image-service secrets and upstream API keys outside the public document root. The included server binds to loopback by default and serves only `public/`. See deployment notes before internet exposure.
