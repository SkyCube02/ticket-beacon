"""Seed the database with realistic SimBix LLP demo data."""
import sys, os
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


def past(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


def seed(force=False):
    db = SessionLocal()
    if db.query(models.User).count() > 0:
        if not force:
            print("Already seeded — skipping. Use --force to re-seed.")
            db.close()
            return
        print("Wiping existing data...")
        # Order matters — delete child tables before parents to avoid FK violations
        for model in [
            models.AuditLog, models.KBEditRequest, models.KBArticle,
            models.Announcement, models.Task, models.Attachment,
            models.ActivationToken, models.Ticket,
            models.WorkSession, models.CalendarMeeting,
            models.RefreshToken, models.MfaOverrideCode,
        ]:
            db.query(model).delete()
        db.execute(models.agent_company_assignments.delete())
        db.query(models.PasswordHistory).delete()
        db.query(models.User).delete()
        db.query(models.Company).delete()
        db.commit()

    # ── Companies ──────────────────────────────────────────────────────────────
    acme       = models.Company(name="ACME Corp",        priority_tier=2)
    novex      = models.Company(name="Novex Solutions",  priority_tier=1)
    greenfield = models.Company(name="Greenfield Tech",  priority_tier=3)
    db.add_all([acme, novex, greenfield])
    db.flush()

    # ── Staff ──────────────────────────────────────────────────────────────────
    ben = models.User(
        email="ben@simbix.com", full_name="Ben Corton",
        password_hash=hash_password("placeholder-not-usable"),
        role="SYSTEM_ADMIN", is_activated=False,
    )
    marcus = models.User(email="marcus@simbix.com", full_name="Marcus Webb",
        password_hash=hash_password("DemoAgent1!xx"), role="TEAM_MANAGER")
    sam = models.User(email="sam@simbix.com", full_name="Sam Riley",
        password_hash=hash_password("DemoAgent1!xx"), role="SENIOR_AGENT")
    jamie = models.User(email="jamie@simbix.com", full_name="Jamie Lee",
        password_hash=hash_password("DemoAgent1!xx"), role="AGENT")
    priya = models.User(email="priya@simbix.com", full_name="Priya Patel",
        password_hash=hash_password("DemoAgent1!xx"), role="AGENT")
    admin_demo = models.User(email="admin@ticketbeacon.com", full_name="Beacon Admin",
        password_hash=hash_password("DemoAdmin1!xx"), role="SYSTEM_ADMIN")

    db.add_all([ben, marcus, sam, jamie, priya, admin_demo])
    db.flush()
    for agent in [ben, marcus, sam, jamie, priya, admin_demo]:
        agent.companies.extend([acme, novex, greenfield])

    # ── Client users ───────────────────────────────────────────────────────────
    alice_c  = models.User(email="alice@acmecorp.com",   full_name="Alice Chen",    password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    david_c  = models.User(email="david@acmecorp.com",   full_name="David Park",    password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    raj_c    = models.User(email="raj@acmecorp.com",     full_name="Raj Mehta",     password_hash=hash_password("ClientDemo1!x"), role="CLIENT_MANAGER")
    tom_c    = models.User(email="tom@novex.com",        full_name="Tom Walsh",     password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    claire_c = models.User(email="claire@novex.com",     full_name="Claire Sutton", password_hash=hash_password("ClientDemo1!x"), role="CLIENT_MANAGER")
    james_c  = models.User(email="james@greenfield.io",  full_name="James Okafor",  password_hash=hash_password("ClientDemo1!x"), role="CLIENT_USER")
    nina_c   = models.User(email="nina@greenfield.io",   full_name="Nina Baxter",   password_hash=hash_password("ClientDemo1!x"), role="CLIENT_MANAGER")

    db.add_all([alice_c, david_c, raj_c, tom_c, claire_c, james_c, nina_c])
    db.flush()
    alice_c.companies.append(acme);  david_c.companies.append(acme);   raj_c.companies.append(acme)
    tom_c.companies.append(novex);   claire_c.companies.append(novex)
    james_c.companies.append(greenfield); nina_c.companies.append(greenfield)
    db.flush()

    # ── Ticket helper ──────────────────────────────────────────────────────────
    _tkt_counter = [0]

    def mk(title, desc, status, priority, req_name, req_email, req_dept,
           company, assignee, tags, h=0, d=0, ack_mins=None, sat=None, sat_note=None,
           breached=False, justification=None):
        _tkt_counter[0] += 1
        n = _tkt_counter[0]
        created = ts(h, d)
        # Acknowledgement time — within SLA by default unless breached
        sla_windows = {"P1": 2, "P2": 10, "P3": 30, "P4": 30, "P5": 30}  # minutes
        if ack_mins is None:
            ack_mins = sla_windows[priority] // 2 if not breached else sla_windows[priority] * 3

        t = models.Ticket(
            ticket_number=f"TKT-{n:03d}", title=title, description=desc,
            status=status, priority=priority,
            requester_name=req_name, requester_email=req_email, requester_dept=req_dept,
            company_id=company.id, assignee_id=assignee.id if assignee else None,
            tags=tags, created_at=created, updated_at=ts(max(0, h // 2), d),
            satisfaction_score=sat, satisfaction_note=sat_note,
            sla_breached=breached,
            priority_justification=justification,
        )
        if status not in ("OPEN",):
            t.acknowledged_at = created + timedelta(minutes=ack_mins)
        if status in ("RESOLVED", "CLOSED"):
            t.resolved_at = ts(max(1, h // 3), d)
        if status == "CLOSED":
            t.closed_at = ts(0, d, 30)
        return t

    # ── Tickets ────────────────────────────────────────────────────────────────
    # Active / recent
    t1  = mk("Outlook crashes on launch after Windows Update — Finance floor",
             "After KB5040442 pushed overnight, 6 Finance workstations crashing Outlook on launch with 0xc000007b. Payroll deadline Friday. Floor 2, rows A–C.",
             "IN PROGRESS","P2","David Park","david@acmecorp.com","Finance", acme, sam, ["email","windows","outlook"], h=5)
    t2  = mk("Primary SQL Server (db-prod-01) unresponsive — production down",
             "db-prod-01 stopped accepting connections at 07:42. All production services degraded. DBA on-call notified. Vendor case #MS-449821 opened.",
             "ESCALATED","P1","Raj Mehta","raj@acmecorp.com","IT", acme, marcus, ["database","production"], h=2,
             justification="Full production outage affecting all ACME services. Revenue impact £8k/hr.")
    t3  = mk("Cisco AnyConnect VPN dropping every 15–20 min — Marketing remote team",
             "Since Monday all Marketing remote workers disconnect every 15–20 min on AnyConnect. On-site users unaffected. MTU issue suspected.",
             "OPEN","P3","Tom Walsh","tom@novex.com","Marketing", novex, None, ["vpn","network","remote"], d=1)
    t4  = mk("DisplayPort not detected on ENG-WS-042",
             "New Dell workstation ENG-WS-042 won't detect secondary monitor over DisplayPort. Primary (HDMI) fine. Driver reinstall did not help.",
             "RESOLVED","P4","Alice Chen","alice@acmecorp.com","Engineering", acme, jamie, ["hardware","monitors"], d=3, sat=5, sat_note="Fixed same day, great service!")
    t5  = mk("Payroll portal login failing — Finance team",
             "Three Finance users cannot log into the payroll portal. Error: Invalid credentials even after password reset. Payroll run due Friday.",
             "PENDING CLIENT","P2","David Park","david@acmecorp.com","Finance", acme, priya, ["payroll","auth"], h=6)
    t6  = mk("GitHub Actions pipeline OOM — all deployments blocked",
             "Pipeline failing exit code 137 (OOM) since 09:00. All staging and prod deployments blocked. Engineers cannot ship hotfixes.",
             "SLA BREACHED","P1","Alice Chen","alice@acmecorp.com","Engineering", acme, sam, ["ci-cd","github"], h=4,
             breached=True, justification="All deployments blocked including critical security hotfix.")
    t7  = mk("HP LaserJet HP-3F-02 showing offline",
             "3rd floor HR area printer offline despite being powered on. Print spooler restart did not resolve. Queue has 14 stuck jobs.",
             "ACKNOWLEDGED","P3","Claire Sutton","claire@novex.com","HR", novex, jamie, ["printer","hardware"], h=8)
    t8  = mk("Adobe Creative Cloud license request — new designer",
             "Marketing needs one additional CC All Apps license for Emily Tran starting 19 May. Budget approved by Claire Sutton.",
             "CLOSED","P5","Tom Walsh","tom@novex.com","Marketing", novex, priya, ["software","license"], d=5, sat=4, sat_note="Sorted quickly, thank you!")
    t9  = mk("Teams video dropping after ~10 minutes — Engineering",
             "Video cuts out after ~10 min in Teams calls for Engineering team (wired). Audio continues. Started after last Teams desktop update.",
             "OPEN","P2","Alice Chen","alice@acmecorp.com","Engineering", acme, None, ["teams","video","network"], h=3)
    t10 = mk("Password reset portal returning HTTP 500",
             "reset.internal returning 500 for all users since ~08:30. Blocking 11 locked-out users.",
             "OPEN","P3","James Okafor","james@greenfield.io","HR", greenfield, None, ["auth","portal"], h=1)
    t11 = mk("MacBook Pro battery draining overnight — Sales",
             "4 MacBook Pros (14\") in Sales draining overnight even when plugged in. Started after macOS 14.4.",
             "OPEN","P4","Tom Walsh","tom@novex.com","Sales", novex, None, ["hardware","battery","macos"], h=12)
    t12 = mk("SharePoint permissions — Project Phoenix team",
             "6 users need Contribute, 2 need Owner on Project Phoenix SharePoint site. Approved by Marcus Webb.",
             "RESOLVED","P4","Nina Baxter","nina@greenfield.io","PMO", greenfield, sam, ["sharepoint","m365"], d=2, sat=5, sat_note="Done same day, perfect.")
    t13 = mk("Veeam backup failing — file-server-01 repository full",
             "Nightly Veeam backup failing for 3 nights. Error: repository full. Storage at 97%. Risk of data loss.",
             "IN PROGRESS","P1","James Okafor","james@greenfield.io","IT", greenfield, marcus, ["backup","storage"], h=18,
             justification="3-day backup gap. GDPR compliance risk if data lost.")
    t14 = mk("New starter provisioning — Emily Tran, Marketing, 19 May",
             "Emily Tran joins ACME 19 May. Needs MacBook Pro 14\", M365, Slack, Adobe CC, CRM. Manager: David Park.",
             "ACKNOWLEDGED","P4","David Park","david@acmecorp.com","HR", acme, jamie, ["onboarding"], h=9)
    t15 = mk("SSL certificate expiring in 11 days — client-portal.acmecorp.com",
             "Let's Encrypt cert expires in 11 days. Auto-renewal failing with 404 on ACME challenge. Nginx config suspected.",
             "IN PROGRESS","P2","Alice Chen","alice@acmecorp.com","Engineering", acme, sam, ["ssl","security"], h=6)

    # Resolved older tickets (good SLA compliance) — past 90 days
    t16 = mk("Slow login on Windows 10 — HR floor",
             "Login taking 4–5 min on 8 HR workstations. GPO applying very slowly.",
             "RESOLVED","P3","Claire Sutton","claire@novex.com","HR", novex, jamie, ["windows","gpo","performance"], d=7, sat=4, sat_note="Issue resolved quickly.")
    t17 = mk("Microsoft Teams crashes on startup — Legal",
             "Teams crashing for 3 Legal staff after update. Clearing cache resolved for 1 user, others still affected.",
             "CLOSED","P3","Nina Baxter","nina@greenfield.io","Legal", greenfield, priya, ["teams","crash"], d=8, sat=5, sat_note="Great support, very patient.")
    t18 = mk("OneDrive sync conflict — shared folder",
             "Multiple users getting conflict files on the Contracts shared folder. Version history showing duplicate edits.",
             "CLOSED","P4","David Park","david@acmecorp.com","Finance", acme, sam, ["onedrive","m365","sync"], d=10, sat=4)
    t19 = mk("Wi-Fi disconnecting in Building B meeting rooms",
             "Meeting rooms B2–B6 dropping Wi-Fi every 20–30 min. Presentation interrupted twice this week.",
             "RESOLVED","P3","Alice Chen","alice@acmecorp.com","Facilities", acme, marcus, ["wifi","network"], d=12, sat=5, sat_note="Fixed before our next presentation, thank you!")
    t20 = mk("Printer driver silent failure on Windows 11",
             "After Windows 11 22H2 rollout, Canon C3226 driver installs but prints blank pages.",
             "CLOSED","P4","Tom Walsh","tom@novex.com","Sales", novex, jamie, ["printer","driver","windows11"], d=14, sat=3, sat_note="Took a bit longer than expected but resolved.")
    t21 = mk("MFA not sending SMS codes — 5 users locked out",
             "After phone number migration 5 users not receiving SMS one-time codes.",
             "RESOLVED","P2","Raj Mehta","raj@acmecorp.com","IT", acme, sam, ["mfa","auth","sms"], d=16, sat=5, sat_note="Sorted within the hour, brilliant!")
    t22 = mk("New starter setup — Jordan Blake, DevOps",
             "Jordan Blake joining Greenfield 3 June. Needs Linux workstation, GitHub org invite, AWS IAM, VPN.",
             "CLOSED","P4","James Okafor","james@greenfield.io","DevOps", greenfield, priya, ["onboarding"], d=18, sat=4, sat_note="Everything ready before they arrived.")
    t23 = mk("Zoom meeting echo — conference room A",
             "Persistent echo in Conference Room A during Zoom calls. AEC not helping. Hardware issue suspected.",
             "RESOLVED","P4","Claire Sutton","claire@novex.com","Facilities", novex, jamie, ["zoom","audio","hardware"], d=20, sat=5)
    t24 = mk("CRM not loading — Salesforce org error",
             "Salesforce returning 'org unavailable' for all ACME users since 09:15. Impact: sales team cannot log calls.",
             "CLOSED","P2","David Park","david@acmecorp.com","Sales", acme, marcus, ["crm","salesforce"], d=22, sat=4, sat_note="Escalated quickly and kept us updated.")
    t25 = mk("Bulk password expiry — 40 users not notified",
             "Notification emails for password expiry failed to send. 40 users will be locked out at midnight.",
             "CLOSED","P2","Alice Chen","alice@acmecorp.com","IT", acme, sam, ["password","auth","ad"], d=25, sat=5, sat_note="Crisis averted! Great response.")
    t26 = mk("VoIP calls dropping — Novex reception",
             "Reception desk VoIP phone dropping calls after ~3 minutes since Monday. VLAN config suspected.",
             "RESOLVED","P3","Tom Walsh","tom@novex.com","Facilities", novex, priya, ["voip","network","vlan"], d=27, sat=4)
    t27 = mk("Excel not opening XLSB files — Finance",
             "Since M365 update, Excel fails to open .xlsb files. Shows 'format not supported' error. Critical for end-of-month reports.",
             "CLOSED","P3","David Park","david@acmecorp.com","Finance", acme, jamie, ["excel","m365","office"], d=30, sat=4, sat_note="Fixed in time for month-end, thank you.")
    t28 = mk("Remote desktop (RDP) latency — developers on VPN",
             "RDP sessions over VPN stuttering badly. 400–800ms latency. Local RDP fine.",
             "RESOLVED","P3","James Okafor","james@greenfield.io","Engineering", greenfield, sam, ["rdp","vpn","network"], d=32, sat=5, sat_note="Significant improvement, much appreciated.")
    t29 = mk("Barcode scanner not recognised on new POS terminal",
             "New Zebra barcode scanner not being detected on Windows 11 POS terminal. COM port conflict suspected.",
             "CLOSED","P4","Nina Baxter","nina@greenfield.io","Operations", greenfield, priya, ["hardware","usb","pos"], d=35, sat=3)
    t30 = mk("Email sending limits exceeded — marketing automation",
             "HubSpot reporting SMTP relay rejection. Daily send limit reached after campaign went live early.",
             "CLOSED","P3","Claire Sutton","claire@novex.com","Marketing", novex, marcus, ["email","smtp","hubspot"], d=38, sat=5, sat_note="Resolved quickly and helped us understand the limits.")
    t31 = mk("Active Directory sync failing — Azure AD Connect",
             "Delta sync failing for 3 hours. 15 new users not provisioned to M365.",
             "CLOSED","P2","Raj Mehta","raj@acmecorp.com","IT", acme, sam, ["ad","azure","m365"], d=40, sat=5, sat_note="Excellent work under pressure.")
    t32 = mk("BSOD on CFO workstation — critical",
             "CFO's workstation blue-screening with SYSTEM_SERVICE_EXCEPTION. Frequent reboot loop. CFO cannot work.",
             "RESOLVED","P1","David Park","david@acmecorp.com","Executive", acme, marcus, ["bsod","hardware","windows"], d=42, sat=5, sat_note="Incredibly fast response. Lifesaver!",
             justification="CFO unable to work. Board meeting in 4 hours with critical presentations.")
    t33 = mk("NAS drive failure alert — greenfield-nas-01",
             "RAID array degraded after drive failure. Single drive redundancy remaining. Immediate replacement required.",
             "CLOSED","P1","James Okafor","james@greenfield.io","IT", greenfield, marcus, ["storage","raid","nas"], d=45, sat=4, sat_note="Drive replaced and array rebuilt overnight.",
             justification="Single point of failure — data loss risk if second drive fails.")
    t34 = mk("Wi-Fi authentication failing — guest network certificates",
             "Guest Wi-Fi certificate expired. Visitors unable to connect. Client meeting in 2 hours.",
             "CLOSED","P2","Nina Baxter","nina@greenfield.io","Facilities", greenfield, sam, ["wifi","ssl","guest"], d=48, sat=5, sat_note="Fixed before clients arrived!")
    t35 = mk("Shared mailbox permissions — Finance operations",
             "4 Finance staff need Send As access to finance-ops@acmecorp.com. Approved by Finance Director.",
             "CLOSED","P5","Alice Chen","alice@acmecorp.com","Finance", acme, priya, ["m365","email","permissions"], d=50, sat=5)
    t36 = mk("Remote worker cannot access internal wiki",
             "Wiki returning 403 for remote user Sarah Mills after role change. Works on-site.",
             "CLOSED","P4","Tom Walsh","tom@novex.com","HR", novex, jamie, ["auth","vpn","wiki"], d=52, sat=4)
    t37 = mk("Laptop screen flickering — Sales team MacBooks",
             "3 MacBook Pros in Sales showing intermittent screen flicker. Possibly GPU driver issue post-macOS update.",
             "RESOLVED","P4","Claire Sutton","claire@novex.com","Sales", novex, priya, ["hardware","macos","display"], d=55, sat=4, sat_note="Quick fix, much appreciated.")
    t38 = mk("Scheduled task failing — weekly invoice export",
             "Weekly invoice export script failing with permission denied since server migration.",
             "CLOSED","P3","James Okafor","james@greenfield.io","Finance", greenfield, sam, ["automation","windows","finance"], d=58, sat=5, sat_note="Picked up without us having to follow up.")
    t39 = mk("Teams phone calls not ringing — reception handsets",
             "Incoming calls not ringing on Teams-certified handsets at Greenfield reception since firmware update.",
             "CLOSED","P3","Nina Baxter","nina@greenfield.io","Facilities", greenfield, jamie, ["teams","voip","hardware"], d=60, sat=4)
    t40 = mk("Ransomware alert — isolated endpoint ENG-LT-019",
             "Defender ATP triggered on ENG-LT-019 with high-confidence ransomware detection. Endpoint isolated automatically.",
             "CLOSED","P1","Alice Chen","alice@acmecorp.com","Security", acme, marcus, ["security","malware","endpoint"], d=62, sat=5, sat_note="Outstanding response. Contained immediately.",
             justification="Potential ransomware. Immediate isolation required to prevent lateral movement.")
    t41 = mk("Software request — AutoCAD 2025 for Engineering",
             "Engineering team needs AutoCAD 2025 upgrade from 2022. 3 seats. Quote attached from Autodesk.",
             "CLOSED","P5","David Park","david@acmecorp.com","Engineering", acme, priya, ["software","license","cad"], d=65, sat=4)
    t42 = mk("Email attachments blocked — PDF over 10MB",
             "Exchange Online blocking PDF attachments over 10MB. Client contracts being rejected. Temporary workaround: SharePoint link.",
             "RESOLVED","P3","Raj Mehta","raj@acmecorp.com","Operations", acme, sam, ["email","exchange","m365"], d=68, sat=5)
    t43 = mk("VPN profile missing after MDM re-enrolment",
             "After re-enrolment in Intune MDM, VPN profile not pushed to 7 devices. Users cannot access internal systems remotely.",
             "CLOSED","P2","Tom Walsh","tom@novex.com","IT", novex, marcus, ["vpn","intune","mdm"], d=70, sat=4, sat_note="Sorted same day, minimal disruption.")
    t44 = mk("USB-C docking station not charging MacBook",
             "Dell WD19 docking station not charging MacBook Pro M3. Display and peripherals work. Power delivery issue.",
             "CLOSED","P4","Claire Sutton","claire@novex.com","Facilities", novex, jamie, ["hardware","usb-c","macos"], d=72, sat=5, sat_note="Issue diagnosed and replacement ordered quickly.")
    t45 = mk("Slack workspace SSO redirect loop — Greenfield",
             "SSO redirect loop on Slack login for Greenfield users after Azure AD conditional access policy change.",
             "CLOSED","P3","James Okafor","james@greenfield.io","IT", greenfield, priya, ["slack","sso","azure"], d=75, sat=4)

    all_tickets = [t1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11,t12,t13,t14,t15,
                   t16,t17,t18,t19,t20,t21,t22,t23,t24,t25,t26,t27,t28,t29,t30,
                   t31,t32,t33,t34,t35,t36,t37,t38,t39,t40,t41,t42,t43,t44,t45]
    db.add_all(all_tickets)
    db.flush()

    # ── Audit logs ─────────────────────────────────────────────────────────────
    def log(ticket, label, action, actor=None, h=0, d=0, m=0, internal=False):
        db.add(models.AuditLog(
            ticket_id=ticket.id, actor_id=actor.id if actor else None,
            actor_label=label, action=action,
            timestamp=ts(h, d, m), is_internal=internal,
        ))

    # Active ticket logs
    log(t1,"David Park","opened ticket",david_c,h=5); log(t1,"Sam Riley","acknowledged — scheduling remote session",sam,h=4,m=55); log(t1,"Sam Riley","status → IN PROGRESS",sam,h=3); log(t1,"Sam Riley","Identified missing VC++ runtime on 4 machines. Deploying via SCCM.",sam,h=2,internal=True)
    log(t2,"Raj Mehta","opened ticket",raj_c,h=2); log(t2,"Marcus Webb","acknowledged — DBA engaged",marcus,h=1,m=58); log(t2,"Marcus Webb","status → ESCALATED — vendor case #MS-449821 open",marcus,m=40); log(t2,"Marcus Webb","Vendor ETA 2hr. Read-only replica failover being considered.",marcus,m=20,internal=True)
    log(t3,"Tom Walsh","opened ticket",tom_c,d=1)
    log(t4,"Alice Chen","opened ticket",alice_c,d=3); log(t4,"Jamie Lee","acknowledged",jamie,d=3); log(t4,"Jamie Lee","status → IN PROGRESS — testing cable and port",jamie,d=2); log(t4,"Jamie Lee","Resolved — faulty DisplayPort cable swapped",jamie,d=1); log(t4,"Jamie Lee","status → RESOLVED",jamie,d=1)
    log(t5,"David Park","opened ticket",david_c,h=6); log(t5,"Priya Patel","acknowledged",priya,h=5,m=55); log(t5,"Priya Patel","status → PENDING CLIENT — awaiting affected user ID list",priya,h=2)
    log(t6,"Alice Chen","opened ticket",alice_c,h=4); log(t6,"Sam Riley","acknowledged",sam,h=3); log(t6,"System","SLA threshold exceeded — P1 2min window breached",h=2); log(t6,"Sam Riley","Raised runner memory limit to 8GB. Monitoring re-run.",sam,h=1,internal=True)
    log(t7,"Claire Sutton","opened ticket",claire_c,h=8); log(t7,"Jamie Lee","status → ACKNOWLEDGED — visiting 3rd floor at 14:00",jamie,h=7,m=55)
    log(t8,"Tom Walsh","opened ticket",tom_c,d=5); log(t8,"Priya Patel","acknowledged — checking license inventory",priya,d=5); log(t8,"Priya Patel","License provisioned and sent to requester",priya,d=3); log(t8,"Priya Patel","status → CLOSED",priya,d=2)
    log(t9,"Alice Chen","opened ticket",alice_c,h=3)
    log(t10,"James Okafor","opened ticket",james_c,h=1)
    log(t11,"Tom Walsh","opened ticket",tom_c,h=12)
    log(t12,"Nina Baxter","opened ticket",nina_c,d=2); log(t12,"Sam Riley","acknowledged — submitting AAD group request",sam,d=2); log(t12,"Sam Riley","Permissions applied",sam,d=1); log(t12,"Sam Riley","status → RESOLVED",sam,d=1)
    log(t13,"James Okafor","opened ticket",james_c,h=18); log(t13,"Marcus Webb","acknowledged — storage team engaged",marcus,h=16); log(t13,"Marcus Webb","status → IN PROGRESS — archiving pre-2023 snapshots",marcus,h=10); log(t13,"Marcus Webb","Freed 42GB. Backup re-running.",marcus,h=5,internal=True)
    log(t14,"David Park","opened ticket",david_c,h=9); log(t14,"Jamie Lee","acknowledged — building provisioning checklist",jamie,h=7,m=55)
    log(t15,"Alice Chen","opened ticket",alice_c,h=6); log(t15,"Sam Riley","acknowledged",sam,h=5,m=58); log(t15,"Sam Riley","status → IN PROGRESS — nginx config missing challenge block",sam,h=3)

    # Resolved ticket logs (brief)
    for ticket, agent, d_val in [
        (t16, jamie, 7), (t17, priya, 8), (t18, sam, 10), (t19, marcus, 12),
        (t20, jamie, 14), (t21, sam, 16), (t22, priya, 18), (t23, jamie, 20),
        (t24, marcus, 22), (t25, sam, 25), (t26, priya, 27), (t27, jamie, 30),
        (t28, sam, 32), (t29, priya, 35), (t30, marcus, 38), (t31, sam, 40),
        (t32, marcus, 42), (t33, marcus, 45), (t34, sam, 48), (t35, priya, 50),
        (t36, jamie, 52), (t37, priya, 55), (t38, sam, 58), (t39, jamie, 60),
        (t40, marcus, 62), (t41, priya, 65), (t42, sam, 68), (t43, marcus, 70),
        (t44, jamie, 72), (t45, priya, 75),
    ]:
        log(ticket, agent.full_name, "opened ticket", d=d_val)
        log(ticket, agent.full_name, "acknowledged", actor=agent, d=d_val)
        log(ticket, agent.full_name, "status → IN PROGRESS", actor=agent, d=d_val-1)
        log(ticket, agent.full_name, f"status → {ticket.status}", actor=agent, d=d_val-2)

    # ── KB Articles ────────────────────────────────────────────────────────────
    kb = lambda title, cat, tags, content, author=None: models.KBArticle(
        title=title, category=cat, tags=tags, content=content,
        author_id=(author or sam).id
    )

    kb_articles = [
        kb("Outlook crashes after Windows Update (0xc000007b)", "Email", ["outlook","windows","crash"],
"""SYMPTOMS
Outlook crashes immediately on launch with error code 0xc000007b following a Windows update.

CAUSE
32/64-bit DLL mismatch or corrupted Visual C++ Redistributable introduced by the update.

RESOLUTION
1. Control Panel → Programs → Uninstall all Microsoft Visual C++ Redistributables.
2. Download latest x86 and x64 VC++ Redistributables from Microsoft.
3. Restart and relaunch Outlook.
4. If still failing: run as Administrator: sfc /scannow, then restart."""),

        kb("VPN disconnecting repeatedly — Cisco AnyConnect", "Network", ["vpn","cisco","anyconnect"],
"""SYMPTOMS
Cisco AnyConnect drops every 15–30 minutes for remote workers.

RESOLUTION
1. Check local internet: ping 8.8.8.8 -t
2. AnyConnect Preferences → uncheck "Allow local LAN access when using VPN"
3. Fix MTU fragmentation: netsh interface ipv4 set subinterface "Cisco AnyConnect" mtu=1300
4. Reinstall AnyConnect if above fails.

ESCALATION
If all remote users drop simultaneously → server-side issue, escalate to network team."""),

        kb("Printer offline in Windows print queue", "Hardware", ["printer","spooler"],
"""SYMPTOMS
Printer shows "Offline" in Windows despite being powered on.

RESOLUTION
1. services.msc → Print Spooler → Restart.
2. Stop spooler, delete all files in C:\\Windows\\System32\\spool\\PRINTERS, restart spooler.
3. Devices and Printers → Printer Properties → Ports: confirm IP matches printer.
4. Remove and re-add the printer if steps fail.

NOTES
Assign a static IP to the printer to prevent recurrence."""),

        kb("How to reset your password", "Account Management", ["password","self-service","account"],
"""SELF-SERVICE RESET (if account not locked)
1. Visit reset.internal from any browser.
2. Enter your email address and click Send Code.
3. Enter the 6-digit code sent to your work mobile.
4. Set a new password: minimum 12 characters, upper + lower + number + symbol.

ACCOUNT LOCKED
If you cannot access reset.internal, raise a support ticket or call the IT helpdesk.
Your manager can authorise an emergency unlock.

PASSWORD REQUIREMENTS
• At least 12 characters
• Must not match your last 10 passwords
• Must not appear in common breach databases

You will be prompted to change your password every 90 days."""),

        kb("How to set up Microsoft Authenticator for MFA", "Account Management", ["mfa","2fa","authenticator","microsoft"],
"""PURPOSE
Multi-factor authentication (MFA) is required for all staff. This guide covers initial setup.

STEPS
1. Download Microsoft Authenticator from App Store or Google Play.
2. Sign in to aka.ms/mysecurityinfo with your work account.
3. Click Add sign-in method → choose Authenticator app.
4. Scan the QR code shown on screen.
5. Approve the test notification pushed to your phone.

LOST YOUR PHONE?
Contact IT immediately. We can issue a temporary bypass code (valid 30 min).
You must re-enrol within 24 hours or your account will enter restricted access.

CHANGING PHONES
Set up the new phone BEFORE removing the old one to avoid being locked out.""", author=marcus),

        kb("How to connect to the VPN from home", "Network", ["vpn","remote","working-from-home"],
"""REQUIREMENTS
• Cisco AnyConnect installed (download from the IT portal)
• Valid VPN credentials (same as your Windows login)
• MFA app configured

STEPS
1. Open Cisco AnyConnect.
2. Enter the VPN gateway address (provided at onboarding — check your welcome email).
3. Enter your username (format: firstname.lastname) and password.
4. Approve the MFA push notification on your phone.

TROUBLESHOOTING
• If connection drops frequently, see "VPN disconnecting repeatedly" article.
• If you receive "Authentication failed", your password may have expired — use reset.internal first.
• If VPN gateway is unreachable, check your internet connection."""),

        kb("How to fix a slow computer", "General IT", ["performance","slow","windows"],
"""QUICK CHECKS (try in order)
1. Restart — if you haven't restarted in over 48 hours, do this first.
2. Task Manager (Ctrl+Shift+Esc) → check for high CPU/memory usage.
3. Close unused browser tabs and applications.
4. Disk space — Settings → System → Storage. Keep at least 10% free.
5. Windows Update — Settings → Update & Security → run any pending updates.

BROWSER SLOWNESS
Clear cache: Ctrl+Shift+Delete → check All time → select Cache → Clear.

IF STILL SLOW
Raise a ticket with:
• Which applications are slow
• When the slowness started
• Screenshot of Task Manager Performance tab"""),

        kb("How to clear your browser cache", "General IT", ["browser","cache","chrome","edge"],
"""GOOGLE CHROME
Ctrl+Shift+Delete → Time range: All time → tick Cached images and files → Clear data

MICROSOFT EDGE
Ctrl+Shift+Delete → Time range: All time → tick Cached images and files → Clear now

FIREFOX
Ctrl+Shift+Delete → Time range: Everything → tick Cache → Clear Now

WHEN TO DO THIS
• Webpage not loading or showing outdated content
• Login page stuck in a loop
• Website behaving differently than expected

Note: clearing cache does not delete your passwords or bookmarks."""),

        kb("How to set up work email on your phone", "Email", ["email","mobile","outlook","iphone","android"],
"""MICROSOFT OUTLOOK APP (recommended)
1. Download Outlook from App Store / Google Play.
2. Open and tap Add Account.
3. Enter your work email address and tap Continue.
4. Sign in with your work Microsoft credentials.
5. Approve the MFA push notification.
6. IT may push a mobile device management (MDM) profile — accept this.

NATIVE MAIL APP (iOS)
Settings → Mail → Accounts → Add Account → Microsoft Exchange.
Enter your email and password. Server: outlook.office365.com

ANDROID NATIVE
Settings → Accounts → Add account → Exchange. Server: outlook.office365.com

NOTE
Your IT team may require Intune Company Portal to be installed before your email activates.
This is normal — it allows us to remotely wipe only the work data if your phone is lost."""),

        kb("How to share your screen in Microsoft Teams", "Collaboration", ["teams","screenshare","meetings"],
"""DURING A CALL
1. Click the Share content button (rectangle with up arrow) in the meeting toolbar.
2. Choose what to share:
   • Desktop — shares your entire screen (others see everything).
   • Window — shares one application only (recommended).
   • PowerPoint Live — upload and present a slide deck directly in Teams.
   • Whiteboard — collaborative digital whiteboard.
3. To stop sharing, click Stop sharing or press the red Stop button.

TIPS
• Close sensitive tabs and applications before sharing your Desktop.
• Use Window sharing to avoid accidentally revealing private information.
• Press Win+Shift+H to hide/show the presenter toolbar.

AUDIO ISSUES DURING SHARE
If meeting audio drops when sharing, check your audio device settings in Teams → Devices."""),

        kb("How to recover a deleted file from OneDrive", "General IT", ["onedrive","recovery","deleted","files"],
"""RECENTLY DELETED (within 30 days)
1. Go to onedrive.com and sign in with your work account.
2. Click Recycle bin in the left panel.
3. Find your file, right-click → Restore.
4. The file returns to its original location.

VERSION HISTORY (file was overwritten)
1. Right-click the file in OneDrive → Version history.
2. Click the three dots next to the version you want → Restore.

FILE NOT IN RECYCLE BIN
If deleted more than 30 days ago, IT may be able to recover from backup.
Raise a ticket immediately — include the file name, folder path, and approximate deletion date.
Recovery is not guaranteed beyond 30 days."""),

        kb("GitHub Actions exit code 137 (OOM)", "DevOps", ["github-actions","oom","ci-cd"],
"""SYMPTOMS
GitHub Actions workflow fails with exit code 137 (Linux OOM kill).

RESOLUTION
1. Identify which step fails — check job step producing exit 137.
2. For Node.js add to step env: NODE_OPTIONS=--max-old-space-size=4096
3. Check Docker daemon memory on self-hosted runners.
4. GitHub-hosted: split into smaller parallel jobs or upgrade runner size.

PREVENTION
Add memory monitoring step early in pipeline to catch regressions."""),

        kb("SSL certificate renewal — Let's Encrypt / Certbot", "Infrastructure", ["ssl","certbot","nginx"],
"""CHECK STATUS
certbot certificates

FORCE RENEWAL
certbot renew --force-renewal && nginx -s reload

COMMON FAILURE — HTTP-01 challenge returning 404
This nginx block must appear BEFORE any redirect rules:

location /.well-known/acme-challenge/ {
    root /var/www/html;
}

MONITORING
Certs expiring within 14 days should be treated as P2. Assign to SENIOR_AGENT+."""),

        kb("New starter IT provisioning checklist", "HR & Onboarding", ["onboarding","new-starter"],
"""Raise a ticket at least 5 working days before the start date.

INFORMATION REQUIRED
• Full name and preferred email format (firstname.lastname or initial.lastname)
• Start date and office location or remote status
• Manager name and department
• Role (determines which access groups and software are provisioned)
• Any specific software requirements not on the standard list

STANDARD PROVISIONS
• Laptop or desktop (specify requirements in ticket)
• Microsoft 365 account (email, Teams, SharePoint, OneDrive)
• VPN credentials and AnyConnect installation
• Slack workspace invite
• Software per role (standard list in IT portal)

DAY 1 PROCESS
New starter receives a welcome email with temporary password and IT support contact.
They must change their password and set up MFA before logging into any services."""),

        kb("How to fix no sound on Windows", "General IT", ["audio","sound","windows","speakers"],
"""QUICK CHECKS
1. Right-click the speaker icon (taskbar) → check volume not muted.
2. Check physical volume on speakers or headset.
3. Right-click speaker icon → Open Sound settings → check correct Output device selected.
4. Try a different audio device (e.g. headphones) to isolate the issue.

DRIVER FIX
Device Manager → Sound, video and game controllers → right-click your audio device → Update driver

TEAMS / ZOOM AUDIO
In Teams: Settings → Devices → check correct speaker and microphone selected.
Test call: Teams → Settings → Devices → Make a test call.

IF NOTHING WORKS
Restart the Windows Audio service:
services.msc → Windows Audio → Restart

Raise a ticket if the issue persists after a restart."""),

        kb("How to request software", "General IT", ["software","request","license","approved-list"],
"""APPROVED SOFTWARE
Check the IT portal for the approved software list before raising a ticket. Common tools are pre-approved and can be installed on request same day.

RAISING A REQUEST
Open a ticket with:
• Software name and version required
• Business justification (one sentence)
• Manager approval (CC your manager or attach email approval)
• Number of licences needed
• Required by date

TIMELINE
• Approved software from list: 1–2 working days
• Unlisted software requiring procurement: 5–10 working days (subject to budget approval)
• Enterprise licences: may require procurement process — raise early

INSTALLATION
IT will either install remotely via SCCM/Intune, or send you an installation link.
Do not install software not on the approved list without prior approval."""),

        kb("How to set up a network printer", "Hardware", ["printer","network","setup"],
"""WINDOWS
1. Settings → Bluetooth & devices → Printers & scanners → Add device.
2. If the printer doesn't appear, click Add manually.
3. Select Add a printer using an IP address or hostname.
4. Enter the printer's IP address (check the label on the printer or ask IT).
5. Select the driver or let Windows install automatically.

MAPPING A SHARED PRINTER
1. Open Run (Win+R) and type \\\\print-server (replace with your print server name).
2. Double-click the printer you need — it installs automatically.

MAC
System Preferences → Printers & Scanners → click + → IP tab.
Enter the printer IP, protocol: IPP or LPD, download the driver from the manufacturer.

DRIVER DOWNLOADS
HP: support.hp.com | Canon: usa.canon.com | Xerox: support.xerox.com"""),

        kb("How to connect to shared network drives", "Network", ["network-drive","fileshare","smb","windows"],
"""WINDOWS — MAP A DRIVE
1. Open File Explorer → right-click This PC → Map network drive.
2. Choose a drive letter (e.g. Z:).
3. Enter the folder path: \\\\fileserver\\sharename (ask IT for the correct path).
4. Tick "Reconnect at sign-in".
5. Tick "Connect using different credentials" if prompted.

COMMON PATHS (ask IT for your organisation's paths)
• Company files: \\\\fileserver\\company
• Department: \\\\fileserver\\departments\\yourteam
• Home drive: \\\\fileserver\\users\\yourusername

DRIVE MISSING AFTER RESTART
Group Policy should re-map drives at login. If missing:
Win+R → gpupdate /force, then sign out and back in.

REMOTE ACCESS
Drives are only accessible when on-site or connected to VPN."""),

        kb("How to fix Teams or Zoom microphone issues", "Collaboration", ["teams","zoom","microphone","audio"],
"""TEST YOUR MICROPHONE FIRST
Windows: Settings → System → Sound → scroll to Input → speak and check the level moves.
If no movement, your mic is muted at the OS level or not selected.

MICROSOFT TEAMS
1. Teams → Settings (... top right) → Devices.
2. Under Microphone, select your correct input device.
3. Click Make a test call to verify.
4. During a call: check the mic icon in the toolbar is not crossed out.

ZOOM
1. Zoom → Settings → Audio.
2. Select correct microphone from the dropdown.
3. Click Test Mic.
4. During a call: Alt+A toggles mute.

PHYSICAL CHECKS
• USB microphones: unplug and re-plug, try a different USB port.
• Headsets: check inline mute button on the headset cable.
• Built-in mic: check if a privacy cover is fitted on the laptop.

STILL NOT WORKING
Raise a ticket with the make/model of your headset and which application is affected."""),

        kb("How to request access to a SharePoint site", "Collaboration", ["sharepoint","m365","permissions","access"],
"""SELF-SERVICE REQUEST
1. Navigate to the SharePoint site URL.
2. If you see "Access denied", click Request access (if enabled).
3. Add a business justification and submit.
4. The site owner will approve or decline.

IF SELF-SERVICE IS NOT AVAILABLE
Raise a support ticket with:
• The full URL of the SharePoint site
• Your name and email
• Level of access needed (Read / Contribute / Owner)
• Manager approval

PROCESSING TIME
Standard access requests: 1–2 working days.
Sensitive or high-privilege sites (Owner level): require line manager AND IT Security sign-off.

EXTERNAL SHARING
Sharing SharePoint content with people outside the organisation requires IT approval. Raise a ticket before inviting external users."""),

        kb("How to report a phishing email", "Security", ["phishing","email","security","scam"],
"""WHAT IS PHISHING?
Phishing emails impersonate trusted senders (your bank, Microsoft, HMRC, or even your manager) to trick you into clicking links or revealing credentials.

WARNING SIGNS
• Urgent language: "Your account will be suspended", "Immediate action required"
• Sender email doesn't match the display name
• Unexpected attachments or password-protected files
• Links that don't match the displayed text (hover to check)
• Requests for passwords, MFA codes, or wire transfers — legitimate systems never ask for these

HOW TO REPORT
1. Do NOT click any links or open attachments.
2. Forward the email to security@simbix.com.
3. In Outlook: Report Message → Phishing (this sends it to Microsoft and IT simultaneously).
4. Raise a support ticket if you believe you may have clicked a link or entered credentials.

IF YOU CLICKED A LINK
Raise a P1 security ticket immediately. Change your password and contact IT.
Do not wait to see if anything happens.""", author=marcus),

        kb("How to enable Windows Remote Desktop (RDP)", "Infrastructure", ["rdp","remote-desktop","windows","remote-access"],
"""ENABLE ON THE TARGET MACHINE
Settings → System → Remote Desktop → toggle On.
Note the PC name shown — you'll need this to connect.

CONNECT FROM ANOTHER MACHINE
1. Press Win+R → type mstsc → press Enter.
2. Enter the target PC name or IP address.
3. Enter your Windows credentials when prompted.

REQUIREMENTS
• Both machines must be on the same network OR connected to VPN.
• Target machine must be powered on (not sleep/hibernate).
• Your account must have RDP permission on the target machine.

REQUEST RDP ACCESS
If you need RDP access to a server or another user's workstation, raise a ticket.
Specify the target machine name and business justification.
Server RDP access requires SENIOR_AGENT approval."""),

        kb("How to reset a user's MFA (SYSTEM_ADMIN only)", "Account Management", ["mfa","2fa","admin","reset"],
"""OVERVIEW
This procedure is for SYSTEM_ADMINs only. Use when a user has lost access to their authenticator app.

PROCEDURE
1. Verify the request via the user's line manager — they must contact SimBix LLP directly.
2. Complete identity verification via video call before proceeding.
3. In Beacon Admin panel → locate the user account.
4. Click Generate Override Code — share this securely with the user (valid 30 min, single use).
5. The user logs in with password + override code.
6. Their account enters re-enrolment mode — they must set up MFA within 24 hours.
7. If they fail to re-enrol, the account is automatically restricted.

AUDIT
All MFA resets are recorded in the audit log. Never reset MFA without identity verification.""", author=ben),
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
            content="The VPN gateway and authentication services will be offline Saturday between 02:00 and 04:00 BST.\n\nActive VPN sessions will be terminated at 02:00. Complete any VPN-dependent work before 01:45 or arrange to be on-site.\n\nBeacon will remain available. Emergency contacts are cached on all desktop clients.",
            category="MAINTENANCE", is_pinned=False, author_id=marcus.id,
        ),
        models.Announcement(
            title="Beacon is now live — FreshService decommissioned",
            content="Beacon is now the official support portal for all IT requests. FreshService was decommissioned on 1 May.\n\nAll new tickets go through Beacon. Historical tickets have been archived — contact IT if you need an old reference.\n\nTraining guides are available in the Knowledge Base.",
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
        models.Task(title="Review Intune MDM policies — mobile device compliance", notes="Check conditional access policies after VPN profile issue (TKT-043).", status="TODO", assignee_id=marcus.id, created_by_id=marcus.id, due_date=future(7)),
        models.Task(title="Deploy Windows 11 23H2 to Engineering fleet", notes="Pilot group of 10 first. Schedule non-business hours.", status="IN_PROGRESS", assignee_id=sam.id, created_by_id=marcus.id, due_date=future(14)),
        models.Task(title="Greenfield onboarding — Jordan Blake access cleanup", notes="Jordan left the onboarding batch. Remove AWS IAM, GitHub, VPN access.", status="TODO", assignee_id=priya.id, created_by_id=marcus.id, due_date=future(2)),
    ])

    db.commit()
    db.close()

    print("\n✓ Seed complete.")
    print(f"  {len(all_tickets)} tickets · {len(kb_articles)} KB articles · 3 announcements · 9 tasks")
    print("  3 companies · 5 staff · 7 client users\n")
    print("Staff credentials:")
    print("  SYSTEM_ADMIN  admin@ticketbeacon.com  / DemoAdmin1!xx")
    print("  TEAM_MANAGER  marcus@simbix.com       / DemoAgent1!xx")
    print("  SENIOR_AGENT  sam@simbix.com          / DemoAgent1!xx")
    print("  AGENT         jamie@simbix.com        / DemoAgent1!xx")
    print("  AGENT         priya@simbix.com        / DemoAgent1!xx")
    print("Client password: ClientDemo1!x")


if __name__ == "__main__":
    seed(force="--force" in sys.argv)
