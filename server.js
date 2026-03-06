const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const app = express();

const ROOT_DIR = __dirname;
const EDITS_FILE = path.join(ROOT_DIR, "data", "editor-edits.json");
const LOAN_APPLICATIONS_FILE = path.join(ROOT_DIR, "data", "loan-applications.json");
const LOAN_APPLICATIONS_CSV_FILE = path.join(ROOT_DIR, "data", "loan-applications.csv");
const LOAN_ESTIMATE_EMAILS_FILE = path.join(ROOT_DIR, "data", "loan-estimate-emails.json");
const SESSION_COOKIE = "ps_editor_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

const EDITOR_USERNAME = process.env.EDITOR_USERNAME || "Robbie";
const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || "Password1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-in-production";

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function readEditsSync() {
  try {
    const content = fs.readFileSync(EDITS_FILE, "utf8");
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    return {};
  }
}

async function writeEdits(edits) {
  await fsp.mkdir(path.dirname(EDITS_FILE), { recursive: true });
  await fsp.writeFile(EDITS_FILE, JSON.stringify(edits, null, 2), "utf8");
}

function readLoanApplicationsSync() {
  try {
    const content = fs.readFileSync(LOAN_APPLICATIONS_FILE, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeLoanApplications(applications) {
  await fsp.mkdir(path.dirname(LOAN_APPLICATIONS_FILE), { recursive: true });
  await fsp.writeFile(LOAN_APPLICATIONS_FILE, JSON.stringify(applications, null, 2), "utf8");
}

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildLoanApplicationsCsvRow(entry) {
  const { id, submittedAt, status, application } = entry;
  const row = [
    id,
    submittedAt,
    status,
    application?.loanRequest?.requestedAmount,
    application?.loanRequest?.loanPurpose,
    application?.loanRequest?.province,
    application?.loanRequest?.preferredTermMonths,
    application?.identity?.firstName,
    application?.identity?.lastName,
    application?.identity?.dateOfBirth,
    application?.identity?.email,
    application?.identity?.phone,
    application?.identity?.sinLast4,
    application?.address?.streetAddress,
    application?.address?.city,
    application?.address?.postalCode,
    application?.address?.housingStatus,
    application?.address?.monthlyHousingCost,
    application?.address?.timeAtAddressMonths,
    application?.employment?.employmentStatus,
    application?.employment?.employerName,
    application?.employment?.jobTitle,
    application?.employment?.timeEmployedMonths,
    application?.employment?.monthlyIncome,
    application?.employment?.incomeFrequency,
    application?.obligations?.creditScoreRange,
    application?.obligations?.existingDebtPayments,
    application?.obligations?.bankruptcies,
    application?.obligations?.coApplicant,
    application?.banking?.bankName,
    application?.banking?.bankAccountType,
    application?.banking?.directDeposit,
    application?.banking?.nextPayDate,
    application?.banking?.fundingMethod,
    application?.compliance?.idType,
    application?.compliance?.idNumber,
    application?.compliance?.consentCreditCheck,
    application?.compliance?.consentElectronicDocs,
    application?.compliance?.consentPrivacy
  ];

  return `${row.map(escapeCsvValue).join(",")}\n`;
}

async function appendLoanApplicationCsv(entry) {
  await fsp.mkdir(path.dirname(LOAN_APPLICATIONS_CSV_FILE), { recursive: true });

  try {
    await fsp.access(LOAN_APPLICATIONS_CSV_FILE, fs.constants.F_OK);
  } catch (error) {
    const header = [
      "id",
      "submittedAt",
      "status",
      "requestedAmount",
      "loanPurpose",
      "province",
      "preferredTermMonths",
      "firstName",
      "lastName",
      "dateOfBirth",
      "email",
      "phone",
      "sinLast4",
      "streetAddress",
      "city",
      "postalCode",
      "housingStatus",
      "monthlyHousingCost",
      "timeAtAddressMonths",
      "employmentStatus",
      "employerName",
      "jobTitle",
      "timeEmployedMonths",
      "monthlyIncome",
      "incomeFrequency",
      "creditScoreRange",
      "existingDebtPayments",
      "bankruptcies",
      "coApplicant",
      "bankName",
      "bankAccountType",
      "directDeposit",
      "nextPayDate",
      "fundingMethod",
      "idType",
      "idNumber",
      "consentCreditCheck",
      "consentElectronicDocs",
      "consentPrivacy"
    ];

    await fsp.writeFile(LOAN_APPLICATIONS_CSV_FILE, `${header.map(escapeCsvValue).join(",")}\n`, "utf8");
  }

  await fsp.appendFile(LOAN_APPLICATIONS_CSV_FILE, buildLoanApplicationsCsvRow(entry), "utf8");
}

function readLoanEstimateEmailsSync() {
  try {
    const content = fs.readFileSync(LOAN_ESTIMATE_EMAILS_FILE, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeLoanEstimateEmails(records) {
  await fsp.mkdir(path.dirname(LOAN_ESTIMATE_EMAILS_FILE), { recursive: true });
  await fsp.writeFile(LOAN_ESTIMATE_EMAILS_FILE, JSON.stringify(records, null, 2), "utf8");
}

function isNonEmptyString(value, maxLength = 200) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isNumberInRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateEstimateEmailRequest(body) {
  if (!body || typeof body !== "object") {
    return "Invalid payload.";
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const estimate = body.estimate;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return "Invalid email address.";
  }

  if (!estimate || typeof estimate !== "object") {
    return "Invalid estimate details.";
  }

  if (
    !isNumberInRange(estimate.principal, 500, 500000) ||
    !isNumberInRange(estimate.apr, 0, 60) ||
    !isNumberInRange(estimate.termYears, 1, 10) ||
    !isNumberInRange(estimate.monthlyPayment, 1, 100000) ||
    !isNumberInRange(estimate.totalRepayment, 1, 5000000) ||
    !isNumberInRange(estimate.totalInterest, 0, 5000000) ||
    !isNonEmptyString(estimate.payoffLabel, 80)
  ) {
    return "Invalid estimate values.";
  }

  return null;
}

function validateLoanApplication(body) {
  if (!body || typeof body !== "object") {
    return "Invalid payload.";
  }

  const { loanRequest, identity, address, employment, obligations, banking, compliance } = body;
  const provinces = new Set(["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);
  const purposes = new Set(["personal", "debt_consolidation", "auto", "emergency", "business"]);
  const employmentStatus = new Set(["full_time", "part_time", "self_employed", "contract", "retired", "benefits"]);
  const housingStatus = new Set(["own", "rent", "family", "other"]);
  const incomeFrequency = new Set(["weekly", "biweekly", "semi_monthly", "monthly"]);
  const creditRanges = new Set(["300-559", "560-659", "660-724", "725+", "unknown"]);
  const yesNo = new Set(["yes", "no"]);
  const bankAccountType = new Set(["chequing", "savings"]);
  const fundingMethods = new Set(["eft", "interac"]);
  const idTypes = new Set(["drivers_license", "passport", "provincial_id"]);

  if (
    !loanRequest ||
    !isNumberInRange(loanRequest.requestedAmount, 500, 500000) ||
    !purposes.has(loanRequest.loanPurpose) ||
    !provinces.has(loanRequest.province) ||
    !isNumberInRange(loanRequest.preferredTermMonths, 6, 120)
  ) {
    return "Invalid loan request details.";
  }

  if (
    !identity ||
    !isNonEmptyString(identity.firstName, 100) ||
    !isNonEmptyString(identity.lastName, 100) ||
    !isNonEmptyString(identity.dateOfBirth, 20) ||
    !isNonEmptyString(identity.email, 200) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) ||
    !isNonEmptyString(identity.phone, 30) ||
    !/^[0-9]{4}$/.test(identity.sinLast4)
  ) {
    return "Invalid identity details.";
  }

  if (
    !address ||
    !isNonEmptyString(address.streetAddress, 200) ||
    !isNonEmptyString(address.city, 100) ||
    !/^[A-Za-z][0-9][A-Za-z][\s-]?[0-9][A-Za-z][0-9]$/.test(address.postalCode) ||
    !housingStatus.has(address.housingStatus) ||
    !isNumberInRange(address.monthlyHousingCost, 0, 20000) ||
    !isNumberInRange(address.timeAtAddressMonths, 0, 1200)
  ) {
    return "Invalid address details.";
  }

  if (
    !employment ||
    !employmentStatus.has(employment.employmentStatus) ||
    !isNonEmptyString(employment.employerName, 160) ||
    !isNonEmptyString(employment.jobTitle, 120) ||
    !isNumberInRange(employment.timeEmployedMonths, 0, 1200) ||
    !isNumberInRange(employment.monthlyIncome, 0, 1000000) ||
    !incomeFrequency.has(employment.incomeFrequency)
  ) {
    return "Invalid employment details.";
  }

  if (
    !obligations ||
    !creditRanges.has(obligations.creditScoreRange) ||
    !isNumberInRange(obligations.existingDebtPayments, 0, 1000000) ||
    !yesNo.has(obligations.bankruptcies) ||
    !yesNo.has(obligations.coApplicant)
  ) {
    return "Invalid financial obligations.";
  }

  if (
    !banking ||
    !isNonEmptyString(banking.bankName, 120) ||
    !bankAccountType.has(banking.bankAccountType) ||
    !yesNo.has(banking.directDeposit) ||
    !isNonEmptyString(banking.nextPayDate, 20) ||
    !fundingMethods.has(banking.fundingMethod)
  ) {
    return "Invalid banking details.";
  }

  if (
    !compliance ||
    !idTypes.has(compliance.idType) ||
    !isNonEmptyString(compliance.idNumber, 80) ||
    compliance.consentCreditCheck !== "yes" ||
    compliance.consentElectronicDocs !== "yes" ||
    compliance.consentPrivacy !== "yes"
  ) {
    return "Required legal consents were not accepted.";
  }

  return null;
}

function createSessionToken(username) {
  const payload = {
    username,
    exp: Date.now() + SESSION_DURATION_MS
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

    if (!payload || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function getSession(req) {
  return verifySessionToken(req.cookies[SESSION_COOKIE]);
}

function requireAuth(req, res, next) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.session = session;
  return next();
}

function sanitizePagePath(pagePath) {
  if (typeof pagePath !== "string") {
    return "/";
  }

  if (!pagePath.startsWith("/")) {
    return "/";
  }

  if (pagePath.length > 200 || pagePath.includes("..")) {
    return "/";
  }

  return pagePath;
}

function sanitizeContentEdits(content) {
  if (!content || typeof content !== "object") {
    return {};
  }

  const sanitized = {};

  Object.keys(content).forEach((selector) => {
    const value = content[selector];

    if (typeof selector !== "string" || selector.length > 300) {
      return;
    }

    if (typeof value !== "string" || value.length > 5000) {
      return;
    }

    sanitized[selector] = value;
  });

  return sanitized;
}

function sanitizeStyleEdits(style) {
  if (!style || typeof style !== "object") {
    return {};
  }

  const allowedProperties = new Set(["color", "backgroundColor", "borderColor"]);
  const sanitized = {};

  Object.keys(style).forEach((selector) => {
    if (typeof selector !== "string" || selector.length > 300) {
      return;
    }

    const styleBlock = style[selector];
    if (!styleBlock || typeof styleBlock !== "object") {
      return;
    }

    const cleanBlock = {};

    Object.keys(styleBlock).forEach((property) => {
      const value = styleBlock[property];

      if (!allowedProperties.has(property)) {
        return;
      }

      if (typeof value !== "string" || value.length > 64) {
        return;
      }

      cleanBlock[property] = value;
    });

    if (Object.keys(cleanBlock).length > 0) {
      sanitized[selector] = cleanBlock;
    }
  });

  return sanitized;
}

app.post("/api/editor/login", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (username !== EDITOR_USERNAME || password !== EDITOR_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = createSessionToken(username);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_MS,
    path: "/"
  });

  return res.json({ ok: true });
});

app.post("/api/editor/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  return res.json({ ok: true });
});

app.get("/api/editor/session", (req, res) => {
  const session = getSession(req);
  return res.json({ authenticated: Boolean(session) });
});

app.get("/api/editor/edits", (req, res) => {
  const page = sanitizePagePath(req.query.page);
  const edits = readEditsSync();
  const pageEdits = edits[page] || {};

  return res.json({
    page,
    content: pageEdits.content || {},
    style: pageEdits.style || {}
  });
});

app.post("/api/editor/edits", requireAuth, async (req, res) => {
  const page = sanitizePagePath(req.body?.page);
  const content = sanitizeContentEdits(req.body?.content);
  const style = sanitizeStyleEdits(req.body?.style);

  const existing = readEditsSync();
  const pageExisting = existing[page] || { content: {}, style: {} };

  existing[page] = {
    content: {
      ...(pageExisting.content || {}),
      ...content
    },
    style: {
      ...(pageExisting.style || {}),
      ...style
    }
  };

  await writeEdits(existing);
  return res.json({ ok: true });
});

app.post("/api/loan-applications", async (req, res) => {
  const validationError = validateLoanApplication(req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const applications = readLoanApplicationsSync();

  const entry = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    status: "received",
    application: req.body
  };

  applications.push(entry);

  await writeLoanApplications(applications);
  await appendLoanApplicationCsv(entry);
  return res.json({ ok: true });
});

app.post("/api/loan-estimate-emails", async (req, res) => {
  const validationError = validateEstimateEmailRequest(req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const records = readLoanEstimateEmailsSync();
  records.push({
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    email: req.body.email.trim().toLowerCase(),
    estimate: req.body.estimate
  });

  await writeLoanEstimateEmails(records);
  return res.json({ ok: true });
});

app.use(express.static(ROOT_DIR, { index: ["index.html"] }));

app.use((req, res) => {
  const cleanPath = req.path.endsWith("/") ? req.path : `${req.path}/`;
  const candidate = path.join(ROOT_DIR, cleanPath, "index.html");

  if (candidate.startsWith(ROOT_DIR) && fs.existsSync(candidate)) {
    return res.sendFile(candidate);
  }

  return res.status(404).send("Not Found");
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
