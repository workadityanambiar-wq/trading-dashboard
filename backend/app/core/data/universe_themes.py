"""
Curated thematic universe definitions.

Structure: THEMES is a list of ThemeGroup, each with Segment children.
Each segment has a curated ticker list.
"""
from dataclasses import dataclass, field
from typing import List

@dataclass
class Segment:
    id: str
    name: str
    tickers: List[str]

@dataclass
class ThemeGroup:
    id: str
    name: str
    color: str          # tailwind accent for UI
    segments: List[Segment]


THEMES: List[ThemeGroup] = [

    # ── AI Infrastructure ─────────────────────────────────────────────────────
    ThemeGroup("ai_infra", "AI Infrastructure", "#6366f1", [
        Segment("ai_chips",      "AI Chips / GPU",         ["NVDA","AMD","INTC","QCOM","MRVL","AVGO","TSMC","SMCI"]),
        Segment("photonics",     "Photonics / Optical",    ["COHR","IIVI","LITE","AAOI","VIAV","FNSR","LPTH","LUMENTUM"]),
        Segment("foundry",       "Semiconductor Foundry",  ["TSM","GFS","UMC","INTC","SAMSUNG"]),
        Segment("chip_equip",    "Chip Equipment / EDA",   ["AMAT","LRCX","KLAC","ASML","TER","ONTO","CAMT","COHU","ACMR"]),
        Segment("memory",        "Memory / Storage",       ["MU","WDC","STX","SNDK","KIOXIA"]),
        Segment("interconnects", "Networking Chips",       ["MRVL","AVGO","CIEN","INFN","IIVI","POET"]),
        Segment("dc_reits",      "Data Center REITs",      ["EQIX","DLR","AMT","CCI","CONE","SWTX","QTS","NXRT"]),
        Segment("servers",       "Servers / HPC Hardware", ["SMCI","HPE","DELL","IBM","NTAP","PSTG"]),
        Segment("ai_power",      "Power & Cooling",        ["VRT","ETN","PWR","ACHR","IR","TT","HSC","AMPS"]),
        Segment("ai_networking", "Hyperscale Networking",  ["CSCO","ANET","JNPR","KEYS","CIEN","VIAV","INFN"]),
    ]),

    # ── Semiconductors (broad) ────────────────────────────────────────────────
    ThemeGroup("semis", "Semiconductors", "#8b5cf6", [
        Segment("semi_design",   "Fabless Design",         ["NVDA","AMD","QCOM","MRVL","AVGO","SWKS","QRVO","MPWR","MCHP","ADI","NXPI","ON","TXN"]),
        Segment("semi_idm",      "IDM (Integrated)",       ["INTC","TI","STM","MXIM","INFN","WOLF"]),
        Segment("semi_analog",   "Analog / Mixed Signal",  ["ADI","TXN","MXIM","MPWR","SMTC","AMBA","DIOD"]),
        Segment("semi_power",    "Power Semiconductors",   ["ON","WOLF","GNSS","IXYS","CREE","STM","IXYS"]),
        Segment("semi_auto",     "Automotive Semis",       ["NXPI","ON","STM","TXN","MCHP","RENESAS"]),
        Segment("semi_rf",       "RF / Wireless",          ["QCOM","SWKS","QRVO","MACOM","RFMD","RFMD"]),
        Segment("eda",           "EDA / IP",               ["SNPS","CDNS","MENT","ANSYS","VRSN"]),
    ]),

    # ── Cloud & Software ──────────────────────────────────────────────────────
    ThemeGroup("cloud_software", "Cloud & Software", "#0ea5e9", [
        Segment("hyperscalers",  "Hyperscalers",           ["MSFT","GOOGL","AMZN","META","BABA","ORCL"]),
        Segment("enterprise_saas","Enterprise SaaS",       ["CRM","NOW","WDAY","ADBE","SAP","INTU","VEEV","BNFT"]),
        Segment("cybersecurity", "Cybersecurity",          ["CRWD","PANW","ZS","FTNT","S","OKTA","CHKP","NET","TENB","RPD"]),
        Segment("data_analytics","Data & Analytics",       ["SNOW","PLTR","DDOG","ESTC","MDB","SPLK","CLDR","NTAP"]),
        Segment("dev_tools",     "Dev Tools / PLG",        ["TEAM","GTLB","HUBS","TWLO","DDOG","PD","ESTC"]),
        Segment("ai_software",   "AI / ML Platforms",      ["MSFT","GOOGL","META","AMZN","IBM","BBAI","AI","SOUN","BBAI"]),
        Segment("fintech_sw",    "Fintech Software",       ["FISV","FIS","NCR","JKHY","SS","PCOR"]),
    ]),

    # ── Healthcare & Biotech ──────────────────────────────────────────────────
    ThemeGroup("healthcare", "Healthcare", "#10b981", [
        Segment("large_biotech", "Large Biotech",          ["AMGN","GILD","REGN","BIIB","ALXN","VRTX","SGEN"]),
        Segment("pharma",        "Pharma (Large Cap)",     ["LLY","PFE","MRK","BMY","ABBV","JNJ","AZN","NVS","RHHBY"]),
        Segment("oncology",      "Oncology",               ["MRNA","BNTX","REGN","BMY","AZN","IDXX","VRTX","FATE","KYMR"]),
        Segment("genomics",      "Genomics / Gene Editing",["ILMN","PACB","CRSP","EDIT","BEAM","NTLA","VERV","ARKG"]),
        Segment("med_devices",   "Medical Devices",        ["MDT","ABT","ISRG","SYK","BSX","BDX","ZBH","EW","HOLX"]),
        Segment("dx_tools",      "Diagnostics & Tools",    ["TMO","DHR","A","BIO","IDXX","NEOG","MESO","BIO"]),
        Segment("ai_health",     "AI in Healthcare",       ["RXRX","NVCR","VEEV","IQVIA","INVA","CERT","EXAS"]),
        Segment("specialty_rx",  "Specialty Pharma",       ["JAZZ","ALKS","SUPN","PRVL","INVA","HRMY","ACAD"]),
    ]),

    # ── Finance & Fintech ─────────────────────────────────────────────────────
    ThemeGroup("finance", "Finance & Fintech", "#f59e0b", [
        Segment("money_center",  "Money Center Banks",     ["JPM","BAC","WFC","C","GS","MS","USB","TFC"]),
        Segment("regional_banks","Regional Banks",         ["USB","PNC","TFC","RF","CFG","HBAN","KEY","MTB","FNB"]),
        Segment("investment_mgmt","Asset Management",      ["BLK","SCHW","AMG","BEN","IVZ","WDR","LM","EV"]),
        Segment("insurance",     "Insurance",              ["BRK-B","AIG","PRU","MET","AFL","ALL","CB","TRV","HIG"]),
        Segment("payments",      "Payments / Networks",    ["V","MA","PYPL","SQ","FIS","FISV","GPN","WEX","FOUR"]),
        Segment("neofintech",    "Neobank / Fintech",      ["SOFI","AFRM","UPST","LEND","LC","OPRT","CACC","ENVA"]),
        Segment("crypto_infra",  "Crypto Infrastructure",  ["COIN","MSTR","RIOT","MARA","HUT","BITF","CLSK","WULF"]),
        Segment("exchanges",     "Exchanges & Trading",    ["CME","ICE","CBOE","NDAQ","MKTX","TRADEWEB"]),
    ]),

    # ── Energy & Clean Tech ───────────────────────────────────────────────────
    ThemeGroup("energy", "Energy & Clean Tech", "#ef4444", [
        Segment("oil_majors",    "Oil & Gas Majors",       ["XOM","CVX","COP","BP","SHEL","TTE","PBR","EQNR"]),
        Segment("oil_exploration","E&P / Exploration",     ["DVN","EOG","PXD","FANG","APA","MRO","OXY","CRC"]),
        Segment("oilfield_svc",  "Oilfield Services",      ["SLB","HAL","BKR","FTI","OII","LBRT","NLFXP"]),
        Segment("solar",         "Solar Energy",           ["ENPH","SEDG","FSLR","SPWR","RUN","NOVA","ARRY","CSIQ"]),
        Segment("wind",          "Wind Energy",            ["NEE","AES","BEP","ORA","CWEN","AWRE","ORION","EVGN"]),
        Segment("nuclear",       "Nuclear Energy",         ["CEG","CCJ","NNE","SMR","OKLO","BWXT","GEV","LEU"]),
        Segment("energy_storage","Battery / Storage",      ["ENVX","ENER","FREYR","EVGO","CHPT","BLNK","AMPX"]),
        Segment("ev",            "Electric Vehicles",      ["TSLA","RIVN","LCID","GM","F","NIO","LI","XPEV","HYZN"]),
        Segment("ev_infra",      "EV Infrastructure",      ["CHPT","EVGO","BLNK","BEAM","VLTA","SNPR","WKHS"]),
        Segment("utilities",     "Utilities (Clean)",      ["NEE","DUK","SO","AEP","EXC","XEL","PEG","ED","WEC"]),
    ]),

    # ── Consumer ─────────────────────────────────────────────────────────────
    ThemeGroup("consumer", "Consumer", "#ec4899", [
        Segment("ecommerce",     "E-Commerce",             ["AMZN","SHOP","ETSY","W","EBAY","BABA","JD","PDD","TEMU"]),
        Segment("streaming",     "Streaming & Media",      ["NFLX","DIS","WBD","PARA","AMZN","SPOT","SIRI","FUBO"]),
        Segment("gaming",        "Gaming",                 ["EA","ATVI","TTWO","RBLX","U","NTES","NCTY","MGAM"]),
        Segment("food_bev",      "Food & Beverage",        ["MCD","SBUX","YUM","QSR","CMG","DNUT","BROS","DPZ"]),
        Segment("luxury",        "Luxury & Apparel",       ["CPRI","RL","PVH","TPR","RMS","LVMH","TIF","KORS"]),
        Segment("travel",        "Travel & Leisure",       ["MAR","HLT","CCL","RCL","NCLH","UAL","DAL","AAL","BKNG","EXPE"]),
        Segment("fitness",       "Health & Fitness",       ["PTON","LULU","NKE","UA","GOOS","PLNT","XPOF","VFC"]),
    ]),

    # ── Emerging Themes ───────────────────────────────────────────────────────
    ThemeGroup("emerging", "Emerging Themes", "#f97316", [
        Segment("quantum",       "Quantum Computing",      ["IBM","IONQ","RGTI","QUBT","QBTS","ARQQ","NTRR","IQM"]),
        Segment("space",         "Space & Satellites",     ["SPCE","LMT","NOC","RTX","BA","IRDM","MAXN","RKLB","ASTS"]),
        Segment("autonomous",    "Autonomous Vehicles",    ["TSLA","MBLY","APTV","LAZR","VLDR","OUST","INVZ","LIDR"]),
        Segment("robotics",      "Robotics & Automation",  ["ISRG","ABB","ROK","EMR","FANUC","IRBT","BRKS","TRMB","GTBIF"]),
        Segment("defense_cyber", "Defense & Cyber",        ["LMT","RTX","NOC","GD","BA","CACI","SAIC","L3H","LDOS"]),
        Segment("biodefense",    "Biodefense / Vaccines",  ["MRNA","BNTX","NVAX","GOVX","SIGA","EMERGENT","BAVARIAN"]),
        Segment("water",         "Water Technology",       ["AWK","WTR","XYLEM","PRMW","NWN","SWX","WTTR","CODX"]),
        Segment("agtech",        "AgriTech",               ["DE","AGCO","CTVA","FMC","CF","MOS","NTR","IPI","DNMR"]),
        Segment("longevity",     "Longevity / Anti-Aging", ["UNITY","CALB","GERO","LYRA","LIFE","CHCO","EXAI"]),
    ]),

    # ── Real Assets ───────────────────────────────────────────────────────────
    ThemeGroup("real_assets", "Real Assets", "#84cc16", [
        Segment("industrial_reits","Industrial REITs",     ["PLD","REXR","FR","EGP","STAG","TRNO","ILPT","PTSG"]),
        Segment("residential_reits","Residential REITs",   ["AVB","EQR","ESS","MAA","NNN","IRT","AIV","UDR"]),
        Segment("infra_reits",   "Infrastructure REITs",   ["AMT","CCI","SBA","SBAC","UNIT","LMRK","UNITI"]),
        Segment("mining",        "Mining & Materials",     ["VALE","RIO","BHP","FCX","AA","CLF","NEM","AEM","KGC"]),
        Segment("industrials",   "Industrials / Capital",  ["CAT","DE","GE","HON","MMM","EMR","ETN","PH","ROK","ITW"]),
        Segment("logistics",     "Logistics & Supply Chain",["UPS","FDX","ODFL","XPO","JBHT","SAIA","WERN","CHRW"]),
    ]),
]

# ── Flat lookup helpers ───────────────────────────────────────────────────────

def get_theme(group_id: str) -> ThemeGroup | None:
    return next((t for t in THEMES if t.id == group_id), None)


def get_segment(group_id: str, segment_id: str) -> Segment | None:
    group = get_theme(group_id)
    if group is None:
        return None
    return next((s for s in group.segments if s.id == segment_id), None)


def get_tickers_for(group_id: str, segment_id: str | None = None) -> list[str]:
    """Return deduplicated tickers for a group or a specific segment."""
    group = get_theme(group_id)
    if group is None:
        return []
    if segment_id:
        seg = get_segment(group_id, segment_id)
        return seg.tickers if seg else []
    # All tickers across all segments in the group
    seen, result = set(), []
    for seg in group.segments:
        for t in seg.tickers:
            if t not in seen:
                seen.add(t)
                result.append(t)
    return result


def themes_as_dict() -> list[dict]:
    """Serializable form for the API."""
    return [
        {
            "id": g.id,
            "name": g.name,
            "color": g.color,
            "segments": [
                {"id": s.id, "name": s.name, "ticker_count": len(s.tickers)}
                for s in g.segments
            ],
        }
        for g in THEMES
    ]
