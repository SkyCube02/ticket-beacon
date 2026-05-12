import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/priority", tags=["priority"])

# ── Keyword banks ─────────────────────────────────────────────────────────────

P1_PATTERNS = [
    (r'\bserver(s)?\s+(is\s+)?down\b', "Server down", 4),
    (r'\bnetwork\s+(is\s+)?down\b', "Network down", 4),
    (r'\bsystem(s)?\s+(is\s+)?down\b', "System down", 4),
    (r'\b(complete|total|full)\s+outage\b', "Total outage", 5),
    (r'\bproduction\s+down\b', "Production down", 5),
    (r'\ball\s+users\b', "All users affected", 4),
    (r'\bcompany.?wide\b', "Company-wide impact", 4),
    (r'\beveryone\s+(is\s+)?(affected|impacted|down|unable)\b', "Everyone affected", 4),
    (r'\bdata\s+(breach|leak|loss|corruption|deleted|wiped)\b', "Data breach/loss", 5),
    (r'\bransomware\b', "Ransomware detected", 5),
    (r'\bsecurity\s+(breach|incident|emergency)\b', "Security incident", 5),
    (r'\bno\s+one\s+can\b', "No one can access", 4),
    (r'\bcritical\s+emergency\b', "Critical emergency", 4),
]

P2_PATTERNS = [
    (r'\b(not\s+working|broken|failed|failure)\b', "Not working/failed", 2),
    (r'\bcannot\s+access\b', "Cannot access", 2),
    (r'\bcan\'?t\s+(log\s*in|login|access|connect)\b', "Can't log in/access", 2),
    (r'\burgent\b', "Marked urgent", 2),
    (r'\basap\b', "ASAP requested", 2),
    (r'\bmultiple\s+users?\b', "Multiple users", 2),
    (r'\bseveral\s+users?\b', "Several users", 2),
    (r'\bmany\s+users?\b', "Many users", 2),
    (r'\bteam\s+(is\s+)?(affected|blocked|unable)\b', "Team affected", 2),
    (r'\bmajor\s+(issue|problem|outage|fault)\b', "Major issue", 2),
    (r'\bwidespread\b', "Widespread impact", 2),
    (r'\bdegraded\b', "Service degraded", 2),
    (r'\bblocked\b', "Users blocked", 1),
    (r'\blogin\s+(fail|error|issue)\b', "Login failure", 2),
]

P4_PATTERNS = [
    (r'\bquestion\b', "General question", -1),
    (r'\bhow\s+(do\s+i|to)\b', "How-to query", -1),
    (r'\bwondering\b', "Non-urgent query", -1),
    (r'\bwhen\s+(you\s+have\s+time|possible|convenient)\b', "No urgency indicated", -2),
    (r'\bno\s+rush\b', "No rush stated", -2),
    (r'\bat\s+your\s+convenience\b', "Non-urgent", -2),
    (r'\bwould\s+be\s+nice\b', "Nice-to-have", -2),
    (r'\bsuggestion\b', "Suggestion/idea", -1),
]

P5_PATTERNS = [
    (r'\blow\s+priority\b', "Self-marked low priority", -3),
    (r'\bminor\s+(issue|bug|problem)\b', "Minor issue", -2),
    (r'\bcosmetic\b', "Cosmetic issue", -3),
    (r'\btypo\b', "Typo/cosmetic", -3),
    (r'\bfeature\s+request\b', "Feature request", -3),
    (r'\benhancement\s+(request)?\b', "Enhancement request", -3),
]

TIER_BONUS = {1: 0, 2: 2, 3: 4}

SCORE_TO_PRIORITY = [
    (8, "P1"),
    (4, "P2"),
    (1, "P3"),
    (-1, "P4"),
    (float('-inf'), "P5"),
]


def suggest_priority(title: str, description: str, priority_tier: int = 1) -> dict:
    text = (title + " " + description).lower()
    score = 0
    reasons = []

    for pattern, label, pts in P1_PATTERNS:
        if re.search(pattern, text):
            score += pts
            reasons.append(label)

    for pattern, label, pts in P2_PATTERNS:
        if re.search(pattern, text):
            score += pts
            reasons.append(label)

    for pattern, label, pts in P4_PATTERNS:
        if re.search(pattern, text):
            score += pts
            reasons.append(label)

    for pattern, label, pts in P5_PATTERNS:
        if re.search(pattern, text):
            score += pts
            reasons.append(label)

    tier_bonus = TIER_BONUS.get(priority_tier, 0)
    if tier_bonus > 0:
        tier_labels = {2: "Premium client (+1 tier)", 3: "Critical client (+2 tiers)"}
        reasons.append(tier_labels.get(priority_tier, f"Company tier bonus"))
        score += tier_bonus

    for threshold, priority in SCORE_TO_PRIORITY:
        if score >= threshold:
            suggested = priority
            break

    confidence = min(1.0, max(0.3, 0.5 + (abs(score) * 0.08)))

    return {
        "suggested": suggested,
        "score": score,
        "confidence": round(confidence, 2),
        "reasons": reasons[:5],  # cap at 5 reasons
    }


# ── Endpoint ──────────────────────────────────────────────────────────────────

class SuggestBody(BaseModel):
    title: str
    description: str = ""
    company_id: Optional[str] = None


@router.post("/suggest")
def suggest(
    body: SuggestBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tier = 1
    if body.company_id:
        company = db.query(models.Company).filter(models.Company.id == body.company_id).first()
        if company:
            tier = company.priority_tier or 1

    return suggest_priority(body.title, body.description, tier)
