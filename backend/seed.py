"""Seed the database with realistic SimBix LLP demo data."""
import sys, os, time
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine
from app import models
from app.auth import hash_password

models.Base.metadata.create_all(bind=engine)


def ts(hours_ago=0, days_ago=0, minutes_ago=0):
    return datetime.now(timezone.utc) - timedelta(
        hours=hours_ago, days=days_ago, minutes=minutes_ago
    )


def future(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")


def seed(force=False):
    db = SessionLocal()
    if db.query(models.User).count() > 0:
        if not force:
            print("Already seeded — skipping. Use --force to re-seed.")
            db.close()
            return
        print("Wiping existing data...")
        for model in [
            models.AuditLog, models.KBEditRequest, models.KBArticle,
            models.Announcement, models.Task, models.Attachment,
            models.ActivationToken, models.Ticket,
        ]:
            db.query(model).delete()
        db.execute(models.agent_company_assignments.delete())
        db.query(models.PasswordHistory).delete()
        db.query(models.User).delete()
        db.query(models.Company).delete()
        db.commit()

    # ── Companies ──────────────────────────────────────────────────────────────
    acme      = models.Company(name="ACME Corp")
    novex     = models.Company(name="Novex Solutions")
    greenfield = models.Company(name="Greenfield Tech")
    db.add_all([acme, novex, greenfield])
    db.flush()

    # ── Staff ──────────────────────────────────────────────────────────────────
    ben = models.User(
        email="ben@simbix.com", full_name="Ben Corton",
        password_hash=hash_password("placeholder-not-usable"),
        role="SYSTEM_ADMIN", is_activated=False,
    )
    marcus = models.User(
        email="marcus@simbix.com", full_name="Marcus Webb",
        password_hash=hash_password("DemoAgent1!xx"), role="TEAM_MANAGER",
    )
    sam = models.User(
        email="sam@simbix.com", full_name="Sam Riley",
        password_hash=hash_password("DemoAgent1!xx"), role="SENIOR_AGENT",
    )
    jamie = models.User(
        email="jamie@simbix.com", full_name="Jamie Lee",
        password_hash=hash_password("DemoAgent1!xx"), role="AGENT",
    )
    priya = models.User(
        email="priya@simbix.com", full_name="Priya Patel",
        password_hash=hash_password("DemoAgent1!xx"), role="AGENT",
    )
    # Fallback admin with known password for demos
    admin_demo = models.User(
        email="admin@ticketbeacon.com", full_name="Ticket Beacon Admin",
        password_hash=hash_password("DemoAdmin1!xx"), role="SYSTEM_ADMIN",
    )
    db.add_all([ben, marcus, sam, jamie, priya, admin_demo])
    db.flush()

    # Assign all staff to all companies
    for agent in [ben, marcus, sam, jamie, priya, admin_demo]:
        agent.companies.extend([acme, novex, greenfield])

    # ── Client users ───────────────────────────────────────────────────────────
    # ACME Corp
    alice_c   = models.User(email="alice@acmecorp.com",   full_name="Alice Chen",    password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    david_c   = models.User(email="david@acmecorp.com",   full_name="David Park",    password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    raj_c     = models.User(email="raj@acmecorp.com",     full_name="Raj Mehta",     password_hash=hash_password("ClientDemo1!x"), role="CLIENT_MANAGER")
    # Novex Solutions
    tom_c     = models.User(email="tom@novex.com",        full_name="Tom Walsh",     password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    claire_c  = models.User(email="claire@novex.com",     full_name="Claire Sutton", password_hash=hash_password("ClientDemo1!x"), role="CLIENT_MANAGER")
    # Greenfield Tech
    james_c   = models.User(email="james@greenfield.io",  full_name="James Okafor",  password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    nina_c    = models.User(email="nina@greenfield.io",   full_name="Nina Baxter",   password_hash=hash_password("ClientDemo1!x"), role="CLIENT_MANAGER")

    db.add_all([alice_c, david_c, raj_c, tom_c, claire_c, james_c, nina_c])
    db.flush()
    alice_c.companies.append(acme);  david_c.companies.append(acme);   raj_c.companies.append(acme)
    tom_c.companies.append(novex);   claire_c.companies.append(novex)
    james_c.companies.append(greenfield); nina_c.companies.append(greenfield)
    db.flush()

    # ── Tickets ────────────────────────────────────────────────────────────────
    def mk(num, title, desc, status, priority, req_name, req_email, req_dept,
           company, assignee, tags, h=0, d=0, sat=None, sat_note=None):
        t = models.Ticket(
            ticket_number=f"TKT-{num:03d}", title=title, description=desc,
            status=status, priority=priority,
            requester_name=req_name, requester_email=req_email, requester_dept=req_dept,
            company_id=company.id, assignee_id=assignee.id if assignee else None,
            tags=tags, created_at=ts(h, d), updated_at=ts(max(0, h-1), d),
            satisfaction_score=sat, satisfaction_note=sat_note,
        )
        if status not in ("OPEN",):
            t.acknowledged_at = ts(max(1, h-1), d)
        if status in ("RESOLVED", "CLOSED"):
            t.resolved_at = ts(1, d)
        if status == "CLOSED":
            t.closed_at = ts(0, d, 30)
        if status == "SLA BREACHED":
            t.sla_breached = True
        return t

    t1  = mk(1,  "Outlook crashes on launch after Windows Update — Finance floor",
              "After KB5040442 pushed overnight, 6 Finance workstations are crashing Outlook on launch with 0xc000007b. Payroll deadline is Friday. Affects floor 2, rows A–C.",
              "IN PROGRESS","P2","David Park","david@acmecorp.com","Finance", acme, sam, ["email","windows","outlook"], h=5)
    t2  = mk(2,  "Primary SQL Server (db-prod-01) unresponsive — production down",
              "db-prod-01 stopped accepting connections at 07:42. All production services degraded. DBA on-call notified. Vendor case #MS-449821 opened.",
              "ESCALATED","P1","Raj Mehta","raj@acmecorp.com","IT", acme, marcus, ["database","production","p1"], h=2)
    t3  = mk(3,  "Cisco AnyConnect VPN dropping every 15–20 min — remote Marketing team",
              "Since Monday all Marketing remote workers disconnect every 15–20 min on the AnyConnect profile. On-site users unaffected. MTU issue suspected.",
              "OPEN","P3","Tom Walsh","tom@novex.com","Marketing", novex, None, ["vpn","network","remote"], d=1)
    t4  = mk(4,  "DisplayPort not detected on ENG-WS-042",
              "New Dell workstation ENG-WS-042 won't detect secondary monitor over DisplayPort. Primary (HDMI) fine. Driver reinstall did not help.",
              "RESOLVED","P4","Alice Chen","alice@acmecorp.com","Engineering", acme, jamie, ["hardware","monitors"], d=3, sat=5, sat_note="Fixed same day. Great service!")
    t5  = mk(5,  "Payroll portal login failing — Finance team",
              "Three Finance users cannot log into the payroll portal. Error: 'Invalid credentials' even after password reset. Payroll run due Friday.",
              "PENDING CLIENT","P2","David Park","david@acmecorp.com","Finance", acme, priya, ["payroll","auth"], h=6)
    t6  = mk(6,  "GitHub Actions pipeline OOM — all deployments blocked",
              "Pipeline failing exit code 137 (OOM) since 09:00. All staging and prod deployments blocked. Engineers cannot ship hotfixes.",
              "SLA BREACHED","P1","Alice Chen","alice@acmecorp.com","Engineering", acme, sam, ["ci-cd","github-actions"], h=4)
    t7  = mk(7,  "HP LaserJet HP-3F-02 showing offline",
              "3rd floor HR area printer offline despite being powered on and connected. Print spooler restart did not resolve. Queue has 14 stuck jobs.",
              "ACKNOWLEDGED","P3","Claire Sutton","claire@novex.com","HR", novex, jamie, ["printer","hardware"], h=8)
    t8  = mk(8,  "Adobe Creative Cloud license request — new designer",
              "Marketing needs one additional CC All Apps license for Emily Tran starting 19 May. Budget approved by Claire Sutton.",
              "CLOSED","P5","Tom Walsh","tom@novex.com","Marketing", novex, priya, ["software","license"], d=5, sat=4)
    t9  = mk(9,  "Teams video dropping after ~10 minutes — Engineering",
              "Video cuts out after ~10 min in Teams calls for Engineering team (wired). Audio continues. Started after last Teams desktop update.",
              "OPEN","P2","Alice Chen","alice@acmecorp.com","Engineering", acme, None, ["teams","video","network"], h=3)
    t10 = mk(10, "Password reset portal returning HTTP 500",
              "reset.internal returning 500 for all users since ~08:30. Locked-out users cannot self-serve. Blocking 11 users.",
              "OPEN","P3","James Okafor","james@greenfield.io","HR", greenfield, None, ["auth","portal"], h=1)
    t11 = mk(11, "MacBook Pro battery draining to 0% overnight — Sales",
              "4 MacBook Pros (14\") in Sales draining overnight even when plugged in. Apple Diagnostics shows no fault. Began after macOS 14.4.",
              "OPEN","P4","Tom Walsh","tom@novex.com","Sales", novex, None, ["hardware","battery","macos"], h=12)
    t12 = mk(12, "SharePoint permissions — Project Phoenix team",
              "6 users need Contribute, 2 need Owner on the Project Phoenix SharePoint site. Approved by Marcus Webb.",
              "RESOLVED","P4","Nina Baxter","nina@greenfield.io","PMO", greenfield, sam, ["sharepoint","m365"], d=2, sat=5, sat_note="Done same day, perfect.")
    t13 = mk(13, "Veeam backup failing — file-server-01 repository full",
              "Nightly Veeam backup for file-server-01 failing for 3 nights. Error: repository full. Storage at 97%. Risk of data loss.",
              "IN PROGRESS","P1","James Okafor","james@greenfield.io","IT", greenfield, marcus, ["backup","storage","veeam"], h=18)
    t14 = mk(14, "New starter provisioning — Emily Tran, Marketing, 19 May",
              "Emily Tran joins ACME 19 May. Needs: MacBook Pro 14\", M365 account, Slack, Adobe CC, CRM access. Manager: David Park.",
              "ACKNOWLEDGED","P4","David Park","david@acmecorp.com","HR", acme, jamie, ["onboarding","new-starter"], h=9)
    t15 = mk(15, "SSL certificate expiring in 11 days — client-portal.acmecorp.com",
              "Let's Encrypt cert expires in 11 days. Auto-renewal failing with 404 on ACME challenge. Nginx config suspected.",
              "IN PROGRESS","P2","Alice Chen","alice@acmecorp.com","Engineering", acme, sam, ["ssl","security"], h=6)

    all_tickets = [t1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11,t12,t13,t14,t15]
    db.add_all(all_tickets)
    db.flush()

    # ── Audit logs ─────────────────────────────────────────────────────────────
    def log(ticket, label, action, actor=None, h=0, d=0, m=0, internal=False):
        db.add(models.AuditLog(
            ticket_id=ticket.id, actor_id=actor.id if actor else None,
            actor_label=label, action=action,
            timestamp=ts(h, d, m), is_internal=internal,
        ))

    log(t1,"David Park","opened ticket",david_c,h=5); log(t1,"Sam Riley","acknowledged — scheduling remote session",sam,h=4); log(t1,"Sam Riley","status → IN PROGRESS",sam,h=3); log(t1,"Sam Riley","Identified missing VC++ runtime on 4 machines. Deploying via SCCM.",sam,h=2,internal=True)
    log(t2,"Raj Mehta","opened ticket",raj_c,h=2); log(t2,"Marcus Webb","acknowledged — DBA engaged",marcus,h=1); log(t2,"Marcus Webb","status → ESCALATED — vendor case #MS-449821 open",marcus,m=40); log(t2,"Marcus Webb","Vendor ETA 2hr. Read-only replica failover being considered.",marcus,m=20,internal=True)
    log(t3,"Tom Walsh","opened ticket",tom_c,d=1)
    log(t4,"Alice Chen","opened ticket",alice_c,d=3); log(t4,"Jamie Lee","acknowledged",jamie,d=3); log(t4,"Jamie Lee","status → IN PROGRESS — testing cable and port",jamie,d=2); log(t4,"Jamie Lee","Resolved — faulty DisplayPort cable swapped",jamie,d=1); log(t4,"Jamie Lee","status → RESOLVED",jamie,d=1)
    log(t5,"David Park","opened ticket",david_c,h=6); log(t5,"Priya Patel","acknowledged",priya,h=5); log(t5,"Priya Patel","status → PENDING CLIENT — awaiting affected user ID list",priya,h=2)
    log(t6,"Alice Chen","opened ticket",alice_c,h=4); log(t6,"Sam Riley","acknowledged",sam,h=3); log(t6,"System","SLA threshold exceeded — P1 2hr window breached",h=2); log(t6,"Sam Riley","Raised runner memory limit to 8GB. Monitoring re-run.",sam,h=1,internal=True)
    log(t7,"Claire Sutton","opened ticket",claire_c,h=8); log(t7,"Jamie Lee","status → ACKNOWLEDGED — visiting 3rd floor at 14:00",jamie,h=5)
    log(t8,"Tom Walsh","opened ticket",tom_c,d=5); log(t8,"Priya Patel","acknowledged — checking license inventory",priya,d=5); log(t8,"Priya Patel","License provisioned and sent to requester",priya,d=3); log(t8,"Priya Patel","status → CLOSED",priya,d=2)
    log(t9,"Alice Chen","opened ticket",alice_c,h=3)
    log(t10,"James Okafor","opened ticket",james_c,h=1)
    log(t11,"Tom Walsh","opened ticket",tom_c,h=12)
    log(t12,"Nina Baxter","opened ticket",nina_c,d=2); log(t12,"Sam Riley","acknowledged — submitting AAD group request",sam,d=2); log(t12,"Sam Riley","Permissions applied",sam,d=1); log(t12,"Sam Riley","status → RESOLVED — confirmed with Nina",sam,d=1)
    log(t13,"James Okafor","opened ticket",james_c,h=18); log(t13,"Marcus Webb","acknowledged — storage team engaged",marcus,h=16); log(t13,"Marcus Webb","status → IN PROGRESS — archiving pre-2023 snapshots",marcus,h=10); log(t13,"Marcus Webb","Freed 42GB. Backup re-running.",marcus,h=5,internal=True)
    log(t14,"David Park","opened ticket",david_c,h=9); log(t14,"Jamie Lee","acknowledged — building provisioning checklist",jamie,h=7)
    log(t15,"Alice Chen","opened ticket",alice_c,h=6); log(t15,"Sam Riley","acknowledged — investigating ACME challenge failure",sam,h=5); log(t15,"Sam Riley","status → IN PROGRESS — nginx config missing challenge location block",sam,h=3); log(t15,"Sam Riley","Cert renewed. Nginx reloaded. Expiry now 90 days.",sam,h=1,internal=True)

    # ── KB Articles ────────────────────────────────────────────────────────────
    kb_articles = [
        models.KBArticle(title="Outlook crashes after Windows Update (0xc000007b)", category="Email", tags=["outlook","windows","crash"],
            author_id=sam.id, content="""SYMPTOMS\nOutlook crashes immediately on launch with error code 0xc000007b following a Windows update.\n\nCAUSE\n32/64-bit DLL mismatch or corrupted Visual C++ Redistributable introduced by the update.\n\nRESOLUTION\n1. Control Panel → Programs → Uninstall all Microsoft Visual C++ Redistributables.\n2. Download and install latest x86 and x64 VC++ Redistributables from Microsoft.\n3. Restart and relaunch Outlook.\n4. If still failing, run as Administrator: sfc /scannow, restart.\n\nAFFECTED SYSTEMS\nWindows 10/11 with Office 365 or Office 2019+."""),
        models.KBArticle(title="VPN disconnecting repeatedly — Cisco AnyConnect", category="Network", tags=["vpn","cisco","anyconnect"],
            author_id=priya.id, content="""SYMPTOMS\nCisco AnyConnect drops every 15–30 minutes for remote workers.\n\nRESOLUTION\n1. Check local internet stability: ping 8.8.8.8 -t\n2. AnyConnect Preferences → uncheck "Allow local LAN access when using VPN"\n3. Raise vpn-idle-timeout to 60 min on the VPN appliance\n4. Fix MTU fragmentation:\n   netsh interface ipv4 set subinterface "Cisco AnyConnect" mtu=1300\n5. Reinstall AnyConnect client if above fails.\n\nESCALATION\nIf all remote users drop simultaneously → server-side issue, escalate to network team."""),
        models.KBArticle(title="Printer offline in Windows print queue", category="Hardware", tags=["printer","spooler"],
            author_id=jamie.id, content="""SYMPTOMS\nPrinter shows "Offline" in Windows print queue despite being powered on.\n\nRESOLUTION\n1. services.msc → Print Spooler → Restart.\n2. Stop spooler, delete all files in C:\\Windows\\System32\\spool\\PRINTERS, restart spooler.\n3. Devices and Printers → Printer Properties → Ports: confirm IP matches printer.\n4. Remove and re-add the printer if steps above fail.\n\nNOTES\nAssign a static IP to the printer to prevent recurrence."""),
        models.KBArticle(title="GitHub Actions exit code 137 (OOM)", category="DevOps", tags=["github-actions","oom","ci-cd"],
            author_id=sam.id, content="""SYMPTOMS\nGitHub Actions workflow fails with exit code 137 (Linux OOM kill).\n\nRESOLUTION\n1. Identify which step fails — check job step producing exit 137.\n2. For Node.js: add to step env: NODE_OPTIONS=--max-old-space-size=4096\n3. For Docker builds: check daemon memory consumption.\n4. Self-hosted runners: check available RAM on host.\n5. GitHub-hosted: split into smaller parallel jobs or upgrade runner.\n\nPREVENTION\nAdd memory monitoring step early in pipeline to catch regressions."""),
        models.KBArticle(title="SSL certificate renewal — Let's Encrypt / Certbot", category="Infrastructure", tags=["ssl","certbot","nginx"],
            author_id=sam.id, content="""CHECK STATUS\ncertbot certificates\n\nFORCE RENEWAL\ncertbot renew --force-renewal && nginx -s reload\n\nCOMMON FAILURE — HTTP-01 challenge returning 404\nThis nginx block must appear BEFORE any redirect rules:\n\nlocation /.well-known/acme-challenge/ {\n    root /var/www/html;\n}\n\nMONITORING\nCerts expiring within 14 days trigger a Datadog alert. Assign immediately to SENIOR_AGENT+."""),
        models.KBArticle(title="New starter IT provisioning checklist", category="HR & Onboarding", tags=["onboarding","new-starter"],
            author_id=jamie.id, content="""Raise a ticket at least 5 working days before the start date.\n\nIT PROVISIONS\n- Laptop or desktop (specify make/model)\n- Microsoft 365 account (email, Teams, SharePoint, OneDrive)\n- VPN credentials\n- Software per role (see approved software list)\n- Slack workspace invite\n\nINFO REQUIRED IN TICKET\n- Full name and preferred email format\n- Start date and office location\n- Manager name and team\n- Role (determines access group)\n- Any specific software requirements\n\nDAY 1\nNew starter receives welcome email with temporary password and IT support contact."""),
        models.KBArticle(title="How to reset a user's MFA (SYSTEM_ADMIN only)", category="Account Management", tags=["mfa","2fa","admin","reset"],
            author_id=ben.id, content="""OVERVIEW\nThis procedure is for SYSTEM_ADMINs only. Use it when a user has lost access to their authenticator app.\n\nPROCEDURE\n1. Verify the request via the user's line manager — they must contact SimBix LLP directly.\n2. Complete identity verification via a video call before proceeding.\n3. In Ticket Beacon Admin panel, locate the user account.\n4. Click "Reset MFA" — this clears the user's TOTP secret and disables 2FA on their account.\n5. Instruct the user to log in with password only, then re-enrol 2FA immediately from Settings.\n6. The user must re-enrol within 24 hours or their account enters restricted access.\n\nAUDIT\nAll MFA resets are recorded in the audit log. Never reset MFA without completing identity verification."""),
    ]
    db.add_all(kb_articles)

    # ── Announcements ──────────────────────────────────────────────────────────
    db.add_all([
        models.Announcement(
            title="SECURITY ALERT: Phishing campaign targeting Finance — CEO impersonation",
            content="A targeted spear-phishing campaign is circulating impersonating our CFO, requesting urgent wire transfers and gift card purchases.\n\nDo NOT act on any email requesting financial transfers without a direct phone verification.\n\n1. Forward suspicious emails to security@simbix.com immediately\n2. Do not click links or download attachments\n3. Raise a SECURITY ticket if credentials were entered on a suspicious page\n\nThis is an active threat. All client organisations have been notified.",
            category="SECURITY", is_pinned=True, author_id=marcus.id,
        ),
        models.Announcement(
            title="Planned maintenance — VPN gateway & authentication services — Saturday 02:00–04:00 BST",
            content="The VPN gateway and authentication services will be offline Saturday between 02:00 and 04:00 BST.\n\nActive VPN sessions will be terminated at 02:00. Complete any VPN-dependent work before 01:45 or arrange to be on-site.\n\nTicket Beacon will remain available. Emergency contacts are cached on all desktop clients.",
            category="MAINTENANCE", is_pinned=False, author_id=marcus.id,
        ),
        models.Announcement(
            title="Ticket Beacon is now live — FreshService decommissioned",
            content="Ticket Beacon is now the official support portal for all IT requests. FreshService was decommissioned on 1 May.\n\nAll new tickets go through Ticket Beacon. Historical tickets have been archived — contact IT if you need an old reference.\n\nTraining guides are available in the Knowledge Base. Raise a ticket if you have any issues accessing the new system.",
            category="GENERAL", is_pinned=False, author_id=ben.id,
        ),
    ])

    # ── Tasks ──────────────────────────────────────────────────────────────────
    db.add_all([
        models.Task(title="Renew SSL cert — client-portal.acmecorp.com", notes="Fix nginx ACME challenge path first. See TKT-015.", status="IN_PROGRESS", assignee_id=sam.id, created_by_id=marcus.id, linked_ticket_id=t15.id, due_date=future(11)),
        models.Task(title="Provision Emily Tran — MacBook Pro + M365", notes="Starts 19 May. See TKT-014. Slack + Adobe CC + CRM access needed.", status="TODO", assignee_id=jamie.id, created_by_id=marcus.id, linked_ticket_id=t14.id, due_date=future(3)),
        models.Task(title="Expand Veeam repo — add 2TB volume", notes="Storage at 97%. Archive pre-2023 snapshots first. See TKT-013.", status="IN_PROGRESS", assignee_id=marcus.id, created_by_id=marcus.id, linked_ticket_id=t13.id, due_date=future(0)),
        models.Task(title="Update Cisco AnyConnect VPN server to 4.10.x", notes="Required before Saturday maintenance. Test with 3 pilot users first.", status="TODO", assignee_id=sam.id, created_by_id=marcus.id, due_date=future(4)),
        models.Task(title="Q2 software license audit", notes="Cross-check M365 assigned vs active users. Remove ex-employee assignments.", status="DONE", assignee_id=priya.id, created_by_id=marcus.id),
        models.Task(title="Draft updated IT security policy (phishing response)", notes="Incorporate new CFO impersonation procedure. Due end of month.", status="TODO", assignee_id=ben.id, created_by_id=marcus.id, due_date=future(21)),
    ])

    db.commit()
    db.close()

    print("\n✓ Seed complete.")
    print("  15 tickets · 7 KB articles · 3 announcements · 6 tasks")
    print("  3 companies · 5 staff · 7 client users\n")
    print("Staff credentials:")
    print("  SYSTEM_ADMIN  ben@simbix.com            (invitation required — run invite flow)")
    print("  SYSTEM_ADMIN  admin@ticketbeacon.com   / DemoAdmin1!xx")
    print("  TEAM_MANAGER  marcus@simbix.com         / DemoAgent1!xx")
    print("  SENIOR_AGENT  sam@simbix.com            / DemoAgent1!xx")
    print("  AGENT         jamie@simbix.com          / DemoAgent1!xx")
    print("  AGENT         priya@simbix.com          / DemoAgent1!xx")
    print("Client credentials (password: ClientDemo1!x):")
    print("  raj@acmecorp.com (ACME Corp, CLIENT_MANAGER)")
    print("  alice@acmecorp.com · david@acmecorp.com (ACME Corp, CLIENT_USER)")
    print("  claire@novex.com (Novex Solutions, CLIENT_MANAGER)")
    print("  tom@novex.com (Novex Solutions, CLIENT_USER)")
    print("  nina@greenfield.io (Greenfield Tech, CLIENT_MANAGER)")
    print("  james@greenfield.io (Greenfield Tech, CLIENT_USER)")


if __name__ == "__main__":
    seed(force="--force" in sys.argv)
