const fs = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DOMAIN = (process.env.SITE_URL || "https://trustedcashloans.ca").replace(/\/$/, "");

const LOAN_AMOUNTS = [500, 1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000];
const TERM_MONTHS = [12, 24, 36, 48, 60];

const PROVINCES = [
  {
    name: "British Columbia",
    slug: "british-columbia",
    code: "BC",
    medianApr: 11.9,
    cities: ["Vancouver", "Surrey", "Burnaby", "Victoria", "Kelowna"],
    overview:
      "Borrowers in British Columbia often compare payment flexibility and total interest before choosing a lender."
  },
  {
    name: "Alberta",
    slug: "alberta",
    code: "AB",
    medianApr: 11.4,
    cities: ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Medicine Hat"],
    overview:
      "Alberta applicants commonly test multiple terms to balance monthly affordability and total borrowing cost."
  },
  {
    name: "Ontario",
    slug: "ontario",
    code: "ON",
    medianApr: 12.1,
    cities: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"],
    overview:
      "Ontario borrowers usually compare several offers and repayment durations before committing to a loan."
  },
  {
    name: "Quebec",
    slug: "quebec",
    code: "QC",
    medianApr: 11.7,
    cities: ["Montreal", "Quebec City", "Laval", "Gatineau", "Longueuil"],
    overview:
      "Quebec borrowers frequently focus on predictable schedules, transparent fees, and manageable debt ratios."
  },
  {
    name: "Manitoba",
    slug: "manitoba",
    code: "MB",
    medianApr: 12.3,
    cities: ["Winnipeg", "Brandon", "Steinbach", "Thompson", "Portage la Prairie"],
    overview:
      "Manitoba applicants often evaluate term options against seasonal income changes and existing obligations."
  },
  {
    name: "Nova Scotia",
    slug: "nova-scotia",
    code: "NS",
    medianApr: 12.5,
    cities: ["Halifax", "Sydney", "Truro", "New Glasgow", "Glace Bay"],
    overview:
      "Nova Scotia residents often compare total repayment and payment size to avoid overextending their budget."
  },
  {
    name: "Saskatchewan",
    slug: "saskatchewan",
    code: "SK",
    medianApr: 11.8,
    cities: ["Saskatoon", "Regina", "Prince Albert", "Moose Jaw", "Yorkton"],
    overview:
      "Saskatchewan borrowers usually compare short and long terms to balance payoff speed with monthly cash flow."
  },
  {
    name: "New Brunswick",
    slug: "new-brunswick",
    code: "NB",
    medianApr: 12.4,
    cities: ["Moncton", "Saint John", "Fredericton", "Dieppe", "Miramichi"],
    overview:
      "New Brunswick borrowers commonly test repayment plans against current debts before submitting applications."
  }
];

const LOAN_TYPES = [
  {
    key: "personal",
    slug: "loan-calculator",
    title: "Personal Loan Calculator",
    displayName: "Personal Loan",
    apr: 11.2,
    defaultAmount: 5000,
    defaultTermMonths: 36,
    summary:
      "Estimate personal loan payments by amount, rate, and term with a Canada-focused interactive calculator."
  },
  {
    key: "emergency",
    slug: "emergency-loan-calculator",
    title: "Emergency Loan Calculator",
    displayName: "Emergency Loan",
    apr: 14.2,
    defaultAmount: 3000,
    defaultTermMonths: 24,
    summary:
      "Model emergency borrowing scenarios quickly and compare repayment timelines before applying."
  },
  {
    key: "bad-credit",
    slug: "bad-credit-loan-calculator",
    title: "Bad Credit Loan Calculator",
    displayName: "Bad Credit Loan",
    apr: 18.9,
    defaultAmount: 5000,
    defaultTermMonths: 36,
    summary:
      "Estimate bad-credit loan repayments and compare term options to plan cash flow pressure."
  },
  {
    key: "debt-consolidation",
    slug: "debt-consolidation-loan-calculator",
    title: "Debt Consolidation Loan Calculator",
    displayName: "Debt Consolidation Loan",
    apr: 10.8,
    defaultAmount: 10000,
    defaultTermMonths: 48,
    summary:
      "Simulate consolidation payments and compare long-term cost before replacing multiple debts."
  },
  {
    key: "auto",
    slug: "auto-loan-calculator",
    title: "Auto Loan Calculator",
    displayName: "Auto Loan",
    apr: 9.6,
    defaultAmount: 15000,
    defaultTermMonths: 60,
    summary:
      "Preview vehicle loan payments by amount and term to test affordability before financing."
  }
];

const FINANCIAL_TOOLS = [
  { slug: "borrowing-power-calculator", title: "Borrowing Power Calculator" },
  { slug: "debt-payoff-calculator", title: "Debt Payoff Calculator" },
  { slug: "interest-comparison-calculator", title: "Interest Comparison Calculator" },
  { slug: "refinance-calculator", title: "Refinance Calculator" }
];

const SCENARIO_AMOUNTS = [2000, 3000, 5000, 7000, 10000, 15000, 20000];

const SCENARIO_STRATEGIES = [
  {
    key: "extra-payment",
    pageSlug: "extra-payments",
    category: "Extra payment strategies",
    queryIntent: "should i pay extra on a loan",
    pageQuestion: "Should You Pay Extra on a ${amount} Loan?",
    intro:
      "This scenario compares a standard repayment plan against adding an extra monthly payment to reduce interest and shorten payoff time.",
    buildConfig(amount, province) {
      return {
        amount,
        apr: province ? province.medianApr : 11,
        baseTermMonths: 36,
        extraPayment: Math.round(Math.max(25, amount * 0.01) / 25) * 25,
        extendedTermMonths: 48,
        reducedApr: Math.max(5.5, (province ? province.medianApr : 11) - 2)
      };
    }
  },
  {
    key: "short-term",
    pageSlug: "short-vs-long-term",
    category: "Loan term comparisons",
    queryIntent: "short vs long loan term",
    pageQuestion: "Should You Choose a Shorter Term for a ${amount} Loan?",
    intro:
      "This scenario compares shorter and longer repayment terms so borrowers can balance monthly affordability with total interest paid.",
    buildConfig(amount, province) {
      return {
        amount,
        apr: province ? province.medianApr : 11.2,
        baseTermMonths: 36,
        extraPayment: 0,
        extendedTermMonths: 60,
        reducedApr: Math.max(5.5, (province ? province.medianApr : 11.2) - 1.8)
      };
    }
  },
  {
    key: "long-term",
    pageSlug: "long-term-affordability",
    category: "Loan term comparisons",
    queryIntent: "long term loan affordability",
    pageQuestion: "Is a Longer Term Better for a ${amount} Loan?",
    intro:
      "This scenario focuses on payment pressure by comparing a longer term against a faster payoff option and measuring the interest tradeoff.",
    buildConfig(amount, province) {
      return {
        amount,
        apr: province ? province.medianApr : 11.5,
        baseTermMonths: 48,
        extraPayment: 0,
        extendedTermMonths: 72,
        reducedApr: Math.max(5.8, (province ? province.medianApr : 11.5) - 1.5)
      };
    }
  },
  {
    key: "save-first",
    pageSlug: "save-first-then-borrow",
    category: "Borrow vs save decisions",
    queryIntent: "loan vs saving first",
    pageQuestion: "Should You Save First Before Borrowing ${amount}?",
    intro:
      "This scenario estimates whether delaying borrowing to build savings can lower loan size and reduce long-term borrowing costs.",
    buildConfig(amount, province) {
      return {
        amount,
        apr: province ? province.medianApr : 10.9,
        baseTermMonths: 36,
        extraPayment: 0,
        extendedTermMonths: 48,
        reducedApr: Math.max(5.5, (province ? province.medianApr : 10.9) - 1.4)
      };
    }
  },
  {
    key: "debt-consolidation",
    pageSlug: "debt-consolidation-vs-personal-loan",
    category: "Debt consolidation scenarios",
    queryIntent: "should i consolidate debt",
    pageQuestion: "Debt Consolidation vs Personal Loan for ${amount}",
    intro:
      "This scenario contrasts a standard personal-loan path with a lower-rate consolidation path to estimate savings potential.",
    buildConfig(amount, province) {
      return {
        amount,
        apr: province ? province.medianApr + 0.6 : 12.3,
        baseTermMonths: 48,
        extraPayment: 0,
        extendedTermMonths: 60,
        reducedApr: Math.max(5, (province ? province.medianApr + 0.6 : 12.3) - 3.1)
      };
    }
  },
  {
    key: "refinance",
    pageSlug: "refinance-loan-savings",
    category: "Refinancing strategies",
    queryIntent: "refinance loan savings",
    pageQuestion: "Can Refinancing Reduce Cost on a ${amount} Loan?",
    intro:
      "This scenario compares an existing higher-rate schedule against a lower-rate refinance with the same term and amount.",
    buildConfig(amount, province) {
      return {
        amount,
        apr: province ? province.medianApr + 1.1 : 12.8,
        baseTermMonths: 48,
        extraPayment: 0,
        extendedTermMonths: 60,
        reducedApr: Math.max(5, (province ? province.medianApr + 1.1 : 12.8) - 2.8)
      };
    }
  }
];

const EDUCATION_GUIDES = [
  {
    slug: "how-loan-interest-works",
    title: "How Loan Interest Works",
    description:
      "Learn how APR, principal, and repayment length influence total borrowing cost.",
    paragraphs: [
      "Interest is the cost of borrowing principal over time. In amortized loans, earlier payments are weighted more toward interest.",
      "APR and repayment length interact: higher APR or longer terms can increase total cost even when monthly payment appears lower.",
      "Comparing multiple terms side by side gives a clearer view of affordability versus long-term cost."
    ]
  },
  {
    slug: "how-monthly-payments-are-calculated",
    title: "How Monthly Payments Are Calculated",
    description:
      "See the installment loan math used to determine fixed monthly repayment amounts.",
    paragraphs: [
      "Monthly payment is based on principal, periodic interest rate, and total number of payments.",
      "Higher APR raises the interest share of each payment; longer terms often reduce monthly payment while increasing total interest.",
      "A calculator lets you test combinations quickly and avoid planning from a single quote."
    ]
  },
  {
    slug: "what-affects-loan-approval-chances",
    title: "What Affects Loan Approval Chances",
    description:
      "Understand common underwriting factors that influence consumer loan approval outcomes.",
    paragraphs: [
      "Approval decisions usually consider income stability, debt-to-income ratio, credit profile, and application consistency.",
      "Reducing revolving balances and requesting a realistic amount can improve your approval position.",
      "Valid, complete data typically helps underwriting speed and reduces back-and-forth documentation requests."
    ]
  },
  {
    slug: "what-is-loan-amortization",
    title: "What Is Loan Amortization",
    description:
      "Loan amortization explained, including how principal and interest portions change over time.",
    paragraphs: [
      "Amortization is the repayment schedule showing exactly how each payment is split between interest and principal.",
      "At the start of the term, a larger share of payment usually goes to interest. As balance declines, principal share increases.",
      "Understanding amortization helps compare offers with similar monthly payments but different total costs."
    ]
  },
  {
    slug: "how-much-loan-can-i-afford",
    title: "How Much Loan Can I Afford",
    description:
      "Use income and debt obligations to estimate a sustainable monthly payment and borrowing amount.",
    paragraphs: [
      "Affordability starts with net monthly cash flow after fixed obligations, not just gross income.",
      "A practical approach is setting a conservative payment target first, then solving for amount and term.",
      "Testing scenarios with different APR and terms helps avoid committing to an unstable payment."
    ]
  }
];

function formatCurrency(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2
  }).format(value);
}

function numberWithCommas(value) {
  return new Intl.NumberFormat("en-CA").format(value);
}

function calculatePayment(principal, aprPercent, months) {
  const monthlyRate = aprPercent / 100 / 12;

  if (monthlyRate === 0) {
    const monthly = principal / months;
    return {
      monthly,
      totalRepayment: monthly * months,
      totalInterest: monthly * months - principal,
      months
    };
  }

  const factor = Math.pow(1 + monthlyRate, months);
  const monthly = principal * ((monthlyRate * factor) / (factor - 1));

  return {
    monthly,
    totalRepayment: monthly * months,
    totalInterest: monthly * months - principal,
    months
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function amountPageUrl(amount) {
  return `/loan-calculator/${amount}/`;
}

function provincePageUrl(slug) {
  return `/loans-in/${slug}/`;
}

function loanTypeUrl(slug) {
  return `/${slug}/`;
}

function guideUrl(slug) {
  return `/learn/${slug}/`;
}

function comboUrl(typeSlug, amount, provinceSlug) {
  return `/${typeSlug}/${amount}/${provinceSlug}/`;
}

function scenarioPageUrl(amount, strategyPageSlug, provinceSlug) {
  const suffix = provinceSlug ? `-${provinceSlug}` : "";
  return `/scenarios/${amount}-loan-${strategyPageSlug}${suffix}/`;
}

function scenarioHubUrl() {
  return "/loan-strategy-scenarios/";
}

function calculatePaymentWithExtra(principal, aprPercent, months, extraPayment) {
  const baseMonthly = calculatePayment(principal, aprPercent, months).monthly;
  const monthlyRate = aprPercent / 100 / 12;
  const scheduledPayment = baseMonthly + Math.max(0, extraPayment);

  let balance = principal;
  let month = 0;
  let totalInterest = 0;
  let totalRepayment = 0;
  const maxMonths = 360;

  while (balance > 0.01 && month < maxMonths) {
    month += 1;
    const interest = monthlyRate > 0 ? balance * monthlyRate : 0;
    let principalPaid = scheduledPayment - interest;

    if (principalPaid <= 0) {
      break;
    }

    if (principalPaid > balance) {
      principalPaid = balance;
    }

    const paymentThisMonth = principalPaid + interest;
    balance -= principalPaid;
    totalInterest += interest;
    totalRepayment += paymentThisMonth;
  }

  return {
    monthly: scheduledPayment,
    totalRepayment,
    totalInterest,
    months: month
  };
}

function strategyLabel(strategyKey) {
  const labels = {
    "extra-payment": "Extra Payment",
    "short-term": "Short Term",
    "long-term": "Long Term",
    "save-first": "Save First",
    "debt-consolidation": "Debt Consolidation",
    refinance: "Refinance"
  };
  return labels[strategyKey] || "Strategy";
}

function buildScenarioComparisonRows(strategy, config) {
  const standard = calculatePayment(config.amount, config.apr, config.baseTermMonths);

  if (strategy.key === "extra-payment") {
    const extra = calculatePaymentWithExtra(config.amount, config.apr, config.baseTermMonths, config.extraPayment);
    const longer = calculatePayment(config.amount, config.apr, config.extendedTermMonths);
    return [
      { label: "Standard", ...standard },
      { label: `Extra Payment (+${formatCurrency(config.extraPayment)})`, ...extra },
      { label: `Longer Term (${config.extendedTermMonths} months)`, ...longer }
    ];
  }

  if (strategy.key === "short-term") {
    const short = calculatePayment(config.amount, config.apr, 24);
    const long = calculatePayment(config.amount, config.apr, config.extendedTermMonths);
    return [
      { label: "Balanced (36 months)", ...standard },
      { label: "Shorter Term (24 months)", ...short },
      { label: `Longer Term (${config.extendedTermMonths} months)`, ...long }
    ];
  }

  if (strategy.key === "long-term") {
    const longer = calculatePayment(config.amount, config.apr, config.extendedTermMonths);
    const faster = calculatePayment(config.amount, config.apr, 36);
    return [
      { label: `Current Plan (${config.baseTermMonths} months)`, ...standard },
      { label: `Longer Term (${config.extendedTermMonths} months)`, ...longer },
      { label: "Faster Payoff (36 months)", ...faster }
    ];
  }

  if (strategy.key === "save-first") {
    const savedPrincipal = Math.max(500, config.amount - Math.round(config.amount * 0.2));
    const saveFirst = calculatePayment(savedPrincipal, config.apr, config.baseTermMonths);
    const extended = calculatePayment(config.amount, config.apr, config.extendedTermMonths);
    return [
      { label: "Borrow Now", ...standard },
      { label: `Save First Then Borrow (${formatCurrency(savedPrincipal)})`, ...saveFirst },
      { label: `Borrow Now with Longer Term (${config.extendedTermMonths} months)`, ...extended }
    ];
  }

  if (strategy.key === "debt-consolidation") {
    const consolidation = calculatePayment(config.amount, config.reducedApr, config.baseTermMonths);
    const long = calculatePayment(config.amount, config.apr, config.extendedTermMonths);
    return [
      { label: "Standard Personal Loan", ...standard },
      { label: `Consolidation Path (${config.reducedApr.toFixed(1)}% APR)`, ...consolidation },
      { label: `Longer Personal Loan (${config.extendedTermMonths} months)`, ...long }
    ];
  }

  if (strategy.key === "refinance") {
    const refinanced = calculatePayment(config.amount, config.reducedApr, config.baseTermMonths);
    const extended = calculatePayment(config.amount, config.apr, config.extendedTermMonths);
    return [
      { label: "Current Loan", ...standard },
      { label: `Refinanced Loan (${config.reducedApr.toFixed(1)}% APR)`, ...refinanced },
      { label: `Keep Current Rate + Longer Term (${config.extendedTermMonths} months)`, ...extended }
    ];
  }

  return [{ label: "Standard", ...standard }];
}

function buildScenarioDecisionSummary(rows) {
  if (!rows.length) {
    return "Compare multiple repayment paths to identify the lowest-risk borrowing decision.";
  }

  const baseline = rows[0];
  const bestInterest = rows.reduce((best, row) => (row.totalInterest < best.totalInterest ? row : best), rows[0]);
  const fastest = rows.reduce((best, row) => (row.months < best.months ? row : best), rows[0]);
  const interestDelta = baseline.totalInterest - bestInterest.totalInterest;
  const monthDelta = baseline.months - fastest.months;

  return `${bestInterest.label} reduces interest by about ${formatCurrency(
    Math.max(0, interestDelta)
  )} versus baseline, while ${fastest.label} shortens payoff by about ${Math.max(0, monthDelta)} months.`;
}

function renderScenarioComparisonTable(rows) {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${formatCurrency(row.monthly)}</td><td>${formatCurrency(
          row.totalInterest
        )}</td><td>${row.months} months</td></tr>`
    )
    .join("\n");

  return `<section class="section"><div class="container"><h2>Simulation Comparison</h2><div class="table-wrap"><table><thead><tr><th>Strategy</th><th>Monthly Payment</th><th>Total Interest</th><th>Loan Duration</th></tr></thead><tbody>${body}</tbody></table></div></div></section>`;
}

function renderCalculatorSection({ amount, apr, termMonths, heading, lead, buttonLabel }) {
  const payment = calculatePayment(amount, apr, termMonths);
  const termYears = Math.max(1, Math.round(termMonths / 12));

  return `<section class="metrics">
    <div class="container metrics-grid">
      <div class="metric">
        <h3 id="metricMonthly">${formatCurrency(payment.monthly)}</h3>
        <p>Estimated Monthly Payment</p>
      </div>
      <div class="metric">
        <h3 id="metricInterest">${formatCurrency(payment.totalInterest)}</h3>
        <p>Estimated Total Interest</p>
      </div>
      <div class="metric">
        <h3 id="metricPayoff">Loading...</h3>
        <p>Estimated Payoff Date</p>
      </div>
    </div>
  </section>

  <section class="section" id="calculator">
    <div class="container loan-calculator-wrap">
      <div>
        <h2>${escapeHtml(heading)}</h2>
        <p>${escapeHtml(lead)}</p>
        <form class="loan-form" id="loanEngineForm" aria-label="Loan calculator form">
          <div class="range-field">
            <label for="loanAmount">Loan Amount (CAD)</label>
            <div class="range-meta">
              <span>$500</span>
              <strong id="loanAmountDisplay">$${numberWithCommas(amount)}</strong>
              <span>$50,000</span>
            </div>
            <input type="range" id="loanAmount" min="500" max="50000" step="100" value="${amount}" required>
          </div>
          <div class="range-field">
            <label for="apr">Annual Interest Rate (%)</label>
            <div class="range-meta">
              <span>5%</span>
              <strong id="aprDisplay">${apr.toFixed(1)}%</strong>
              <span>29%</span>
            </div>
            <input type="range" id="apr" min="5" max="29" step="0.1" value="${apr.toFixed(1)}" required>
          </div>
          <div>
            <label for="termYears">Loan Term (Years)</label>
            <input type="number" id="termYears" min="1" max="10" step="1" value="${termYears}" required>
          </div>
          <div>
            <label for="monthlyIncome">Monthly Income (CAD)</label>
            <input type="number" id="monthlyIncome" min="1000" max="50000" step="100" value="4500" required>
          </div>
          <div>
            <label for="existingDebt">Current Monthly Debt Payments (CAD)</label>
            <input type="number" id="existingDebt" min="0" max="30000" step="50" value="600" required>
          </div>
          <div>
            <label for="startMonth">Start Month</label>
            <input type="month" id="startMonth" required>
          </div>
          <button type="submit" class="btn btn-primary">${escapeHtml(buttonLabel)}</button>
        </form>
      </div>
      <aside class="loan-results" aria-live="polite">
        <h3>Your Estimate Snapshot</h3>
        <div class="results-grid">
          <div class="result-box"><p>Monthly Payment</p><strong id="monthlyPayment">${formatCurrency(payment.monthly)}</strong></div>
          <div class="result-box"><p>Total Repayment</p><strong id="totalRepayment">${formatCurrency(payment.totalRepayment)}</strong></div>
          <div class="result-box"><p>Total Interest</p><strong id="totalInterest">${formatCurrency(payment.totalInterest)}</strong></div>
          <div class="result-box"><p>Payoff Date</p><strong id="payoffDate">Loading...</strong></div>
        </div>
        <p id="formMessage" class="form-message">Adjust amount, rate, and term to compare scenarios.</p>
        <form id="estimateEmailForm" class="estimate-email-form" aria-label="Email loan estimate">
          <label for="estimateEmail">Save this result</label>
          <div class="estimate-email-controls">
            <input type="email" id="estimateEmail" autocomplete="email" placeholder="name@email.com" required>
            <button type="submit" class="btn btn-primary">Email My Loan Estimate</button>
          </div>
          <p id="estimateEmailMessage" class="form-message" aria-live="polite"></p>
        </form>
      </aside>
    </div>
  </section>`;
}

function renderTermComparisonTable(amount, apr) {
  const rows = TERM_MONTHS.map((termMonths) => {
    const payment = calculatePayment(amount, apr, termMonths);
    return `<tr><td>${termMonths} months</td><td>${formatCurrency(payment.monthly)}</td></tr>`;
  }).join("\n");

  return `<section class="section"><div class="container"><h2>Term Comparison Table</h2><div class="table-wrap"><table><thead><tr><th>Term</th><th>Monthly Payment</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
}

function renderExamplePaymentTable(apr, termMonths = 36) {
  const rows = LOAN_AMOUNTS.map((amount) => {
    const payment = calculatePayment(amount, apr, termMonths);
    return `<tr><td>$${numberWithCommas(amount)}</td><td>${formatCurrency(payment.monthly)}</td></tr>`;
  }).join("\n");

  return `<section class="section"><div class="container"><h2>Example Payment Table</h2><div class="table-wrap"><table><thead><tr><th>Loan Amount</th><th>Monthly Payment</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
}

function renderRelatedCalculatorsSection({ amount, provinceSlug, typeSlug, excludeGuideSlug }) {
  const amountLinks = LOAN_AMOUNTS.filter((value) => value !== amount)
    .slice(0, 8)
    .map((value) => `<li><a href="${amountPageUrl(value)}">$${numberWithCommas(value)} loan calculator</a></li>`)
    .join("\n");

  const provinceLinks = PROVINCES.filter((province) => province.slug !== provinceSlug)
    .slice(0, 8)
    .map((province) => `<li><a href="${provincePageUrl(province.slug)}">Loans in ${escapeHtml(province.name)}</a></li>`)
    .join("\n");

  const toolLinks = [
    ...LOAN_TYPES.filter((type) => type.slug !== typeSlug).map((type) => ({ slug: type.slug, title: type.title })),
    ...FINANCIAL_TOOLS
  ]
    .slice(0, 8)
    .map((tool) => `<li><a href="/${tool.slug}/">${escapeHtml(tool.title)}</a></li>`)
    .join("\n");

  const guideLinks = EDUCATION_GUIDES.filter((guide) => guide.slug !== excludeGuideSlug)
    .slice(0, 5)
    .map((guide) => `<li><a href="${guideUrl(guide.slug)}">${escapeHtml(guide.title)}</a></li>`)
    .join("\n");

  return `<section class="section"><div class="container"><h2>Related Calculators</h2><div class="framework-grid"><article class="card"><h3>Loan Amount Pages</h3><ul>${amountLinks}</ul></article><article class="card"><h3>Province Pages</h3><ul>${provinceLinks}</ul></article><article class="card"><h3>Financial Tools</h3><ul>${toolLinks}</ul></article><article class="card"><h3>Education Guides</h3><ul>${guideLinks}</ul></article></div></div></section>`;
}

function buildFaqSchema(faqItems) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
}

function buildWebApplicationSchema({ title, description, canonicalPath }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: title,
    description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: `${DOMAIN}${canonicalPath}`
  };
}

function buildFinancialProductSchema({ title, canonicalPath, apr, amount, provinceName }) {
  const product = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: title,
    category: "Installment Loan",
    url: `${DOMAIN}${canonicalPath}`,
    interestRate: apr
  };

  if (typeof amount === "number") {
    product.amount = {
      "@type": "MonetaryAmount",
      currency: "CAD",
      value: amount
    };
  }

  if (provinceName) {
    product.areaServed = {
      "@type": "AdministrativeArea",
      name: provinceName
    };
  }

  return product;
}

function buildHowToSchema({ name, canonicalPath, steps }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    url: `${DOMAIN}${canonicalPath}`,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step
    }))
  };
}

function renderFaqSection(faqItems) {
  const cards = faqItems
    .map((item) => `<article class="card"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></article>`)
    .join("\n");

  return `<section class="section"><div class="container"><h2>Frequently Asked Questions</h2><div class="framework-grid">${cards}</div></div></section>`;
}

function renderLayout(page) {
  const bodyDataAttributes = [];

  if (typeof page.prefillAmount === "number") {
    bodyDataAttributes.push(`data-prefill-amount="${page.prefillAmount}"`);
  }

  if (typeof page.prefillApr === "number") {
    bodyDataAttributes.push(`data-prefill-apr="${page.prefillApr.toFixed(1)}"`);
  }

  if (typeof page.prefillTermYears === "number") {
    bodyDataAttributes.push(`data-prefill-term-years="${page.prefillTermYears}"`);
  }

  const schemaScripts = (page.schemas || []).map(
    (schema) => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  );

  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(page.title)} | Trusted Cash Loans</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="keywords" content="${escapeHtml(page.keywords)}">
<link rel="canonical" href="${DOMAIN}${page.canonicalPath}">
<link rel="icon" href="/assets/images/trusted-cash-loans-logo.png">
<link rel="stylesheet" href="/assets/style/style.css">
<script src="/assets/scripts/script.js" defer></script>
</head>
<body class="${escapeHtml(page.bodyClass || "page-home")}" ${bodyDataAttributes.join(" ")}>
<header>
  <div class="container nav">
    <a href="/" class="brand-mark"><img src="/assets/images/trusted-cash-loans-logo.png" alt="Trusted Cash Loans bird logo" class="brand-mark-logo" height="34"><span>Trusted Cash Loans</span></a>
    <div class="nav-links">
      <a href="/loan-calculators/">Ecosystem</a>
      <a href="/loan-strategy-scenarios/">Scenarios</a>
      <a href="/loan-calculator/">Amounts</a>
      <a href="/provinces/">Provinces</a>
      <a href="/learn/">Guides</a>
      <a href="/apply/">Apply</a>
    </div>
  </div>
</header>
<main>
<section class="hero"><div class="container"><h1>${escapeHtml(page.heroTitle)}</h1><p>${escapeHtml(
    page.heroText
  )}</p><div class="cta-group"><a href="${page.primaryCtaHref || "#calculator"}" class="btn btn-primary">${escapeHtml(
    page.primaryCtaLabel || "Use Calculator"
  )}</a><a href="${page.secondaryCtaHref || "/apply/"}" class="btn btn-secondary">${escapeHtml(
    page.secondaryCtaLabel || "Start Application"
  )}</a></div></div></section>
<section class="conversion-funnel" aria-label="Conversion funnel">
  <div class="container">
    <h2>Conversion Funnel</h2>
    <div class="funnel-grid">
      <article class="funnel-stage"><p class="funnel-stage-label">Top Funnel</p><p class="funnel-stage-step">Calculate My Payment</p></article>
      <article class="funnel-stage"><p class="funnel-stage-label">Mid Funnel</p><p class="funnel-stage-step">Compare Loan Scenarios</p></article>
      <article class="funnel-stage"><p class="funnel-stage-label">Lower Funnel</p><p class="funnel-stage-step">Evaluate Financial Impact</p></article>
      <article class="funnel-stage"><p class="funnel-stage-label">Bottom Funnel</p><p class="funnel-stage-step">Check Loan Options</p></article>
      <article class="funnel-stage funnel-stage-final"><p class="funnel-stage-label">Final Conversion</p><a href="/apply/" class="funnel-stage-step funnel-stage-link">Start Application</a></article>
    </div>
  </div>
</section>
<section class="trust-strip" aria-label="Trust signals">
  <div class="container trust-grid">
    <p class="trust-item">Secure calculations</p>
    <p class="trust-item">No credit check for estimates</p>
    <p class="trust-item">Serving all Canadian provinces</p>
    <p class="trust-item">Fast approval timelines</p>
  </div>
  <div class="container social-proof-wrap">
    <p id="socialProofCounter" class="social-proof-text"><span data-daily-checks-count>42</span> Canadians checked loan options today</p>
  </div>
</section>
<section class="how-it-works-strip" aria-label="Application timeline">
  <div class="container">
    <h2>Application Timeline</h2>
    <div class="steps-grid">
      <article class="step-card"><span class="step-icon" aria-hidden="true">&#x1F4CA;</span> Estimate loan</article>
      <article class="step-card"><span class="step-icon" aria-hidden="true">&#x2696;</span> Compare scenarios</article>
      <article class="step-card"><span class="step-icon" aria-hidden="true">&#x1F512;</span> Apply securely</article>
      <article class="step-card"><span class="step-icon" aria-hidden="true">&#x1F4B8;</span> Receive funds</article>
    </div>
  </div>
</section>
${page.mainContent}
</main>
<footer><div class="container">© 2026 Trusted Cash Loans | <a href="/privacy/">Privacy</a> | <a href="/terms/">Terms</a></div></footer>
<a class="sticky-cta" href="#calculator" data-fallback-href="/loan-calculator/">Check Loan Options</a>
${schemaScripts.join("\n")}
</body>
</html>`;
}

function renderAmountPage(amount) {
  const loanType = LOAN_TYPES[0];
  const province = PROVINCES.find((item) => item.slug === "ontario") || PROVINCES[0];
  const canonicalPath = amountPageUrl(amount);
  const payment = calculatePayment(amount, loanType.apr, 36);

  const faqItems = [
    {
      question: `What is an example monthly payment for a $${numberWithCommas(amount)} loan?`,
      answer: `At ${loanType.apr.toFixed(1)}% APR over 36 months, the estimated payment is ${formatCurrency(
        payment.monthly
      )} per month.`
    },
    {
      question: "Can I change rate and term?",
      answer: "Yes. The embedded calculator lets you adjust APR, amount, and term to test different outcomes."
    }
  ];

  const mainContent = `${renderCalculatorSection({
    amount,
    apr: loanType.apr,
    termMonths: 36,
    heading: `$${numberWithCommas(amount)} Loan Calculator`,
    lead: "Estimate payment, total repayment, and interest for this amount.",
    buttonLabel: "Update Estimate"
  })}
<section class="section"><div class="container"><h2>Example Monthly Payment</h2><p>For a $${numberWithCommas(
    amount
  )} loan in Canada using ${loanType.apr.toFixed(1)}% APR across 36 months, the estimated payment is <strong>${formatCurrency(
    payment.monthly
  )}</strong> per month.</p><p>Total repayment is <strong>${formatCurrency(
    payment.totalRepayment
  )}</strong>, with estimated interest of <strong>${formatCurrency(payment.totalInterest)}</strong>.</p></div></section>
${renderTermComparisonTable(amount, loanType.apr)}
${renderExamplePaymentTable(loanType.apr, 36)}
${renderRelatedCalculatorsSection({ amount, provinceSlug: province.slug, typeSlug: loanType.slug })}
${renderFaqSection(faqItems)}`;

  return renderLayout({
    title: `$${numberWithCommas(amount)} Loan Calculator Canada`,
    description: `Estimate monthly payment for a $${numberWithCommas(
      amount
    )} loan with term comparison and example payment tables.`,
    keywords: `${amount} loan calculator canada, ${amount} monthly payment, loan term comparison`,
    canonicalPath,
    heroTitle: `$${numberWithCommas(amount)} Loan Calculator`,
    heroText: "Calculate your monthly payment, compare terms, and review practical payment examples.",
    prefillAmount: amount,
    prefillApr: loanType.apr,
    prefillTermYears: 3,
    mainContent,
    secondaryCtaLabel: "View Province Pages",
    secondaryCtaHref: "/provinces/",
    schemas: [
      buildFaqSchema(faqItems),
      buildWebApplicationSchema({ title: `$${numberWithCommas(amount)} Loan Calculator`, description: "Loan payment web calculator", canonicalPath }),
      buildFinancialProductSchema({ title: `$${numberWithCommas(amount)} Personal Loan Example`, canonicalPath, apr: loanType.apr, amount })
    ]
  });
}

function renderProvincePage(province) {
  const amount = 5000;
  const loanType = LOAN_TYPES[0];
  const canonicalPath = provincePageUrl(province.slug);
  const payment = calculatePayment(amount, province.medianApr, 36);

  const faqItems = [
    {
      question: `How much is a $${numberWithCommas(amount)} loan payment in ${province.name}?`,
      answer: `At ${province.medianApr.toFixed(1)}% APR over 36 months, estimated monthly payment is ${formatCurrency(
        payment.monthly
      )}.`
    },
    {
      question: "Can I test different amounts for this province?",
      answer: "Yes. This page links to amount-specific calculators and provides a full example payment table."
    }
  ];

  const cityLine = province.cities.map((city) => escapeHtml(city)).join(", ");
  const amountLinks = LOAN_AMOUNTS.map(
    (value) => `<li><a href="${amountPageUrl(value)}">$${numberWithCommas(value)} loan calculator</a></li>`
  ).join("\n");

  const mainContent = `${renderCalculatorSection({
    amount,
    apr: province.medianApr,
    termMonths: 36,
    heading: `${province.name} Loan Calculator`,
    lead: "Estimate local repayment scenarios and compare term options.",
    buttonLabel: "Recalculate"
  })}
<section class="section"><div class="container"><h2>Local Loan Overview</h2><p>${escapeHtml(
    province.overview
  )}</p><p>City relevance: ${cityLine}.</p><p>Example: A $${numberWithCommas(amount)} loan at ${province.medianApr.toFixed(
    1
  )}% APR over 36 months is about <strong>${formatCurrency(payment.monthly)}</strong> monthly.</p></div></section>
<section class="section"><div class="container"><h2>Loan Amount Pages for ${escapeHtml(
    province.name
  )}</h2><ul>${amountLinks}</ul></div></section>
${renderTermComparisonTable(amount, province.medianApr)}
${renderExamplePaymentTable(province.medianApr, 36)}
${renderRelatedCalculatorsSection({ amount, provinceSlug: province.slug, typeSlug: loanType.slug })}
${renderFaqSection(faqItems)}`;

  return renderLayout({
    title: `Loans in ${province.name}`,
    description: `Province-specific loan overview, city mentions, calculator, and payment examples for ${province.name}.`,
    keywords: `loans in ${province.name.toLowerCase()}, ${province.name.toLowerCase()} loan calculator, canada province loans`,
    canonicalPath,
    heroTitle: `Loans in ${province.name}`,
    heroText: "See local borrowing context, city-level relevance, and interactive payment planning.",
    prefillAmount: amount,
    prefillApr: province.medianApr,
    prefillTermYears: 3,
    mainContent,
    secondaryCtaLabel: "View Loan Amount Pages",
    secondaryCtaHref: "/loan-calculator/",
    schemas: [
      buildFaqSchema(faqItems),
      buildWebApplicationSchema({ title: `Loan Calculator for ${province.name}`, description: "Province loan web calculator", canonicalPath }),
      buildFinancialProductSchema({ title: `${province.name} Personal Loan Example`, canonicalPath, apr: province.medianApr, amount, provinceName: province.name })
    ]
  });
}

function renderLoanTypePage(type) {
  const province = PROVINCES.find((item) => item.slug === "ontario") || PROVINCES[0];
  const canonicalPath = loanTypeUrl(type.slug);
  const payment = calculatePayment(type.defaultAmount, type.apr, type.defaultTermMonths);

  const faqItems = [
    {
      question: `What is a sample ${type.displayName.toLowerCase()} payment?`,
      answer: `For $${numberWithCommas(type.defaultAmount)} at ${type.apr.toFixed(
        1
      )}% APR over ${type.defaultTermMonths} months, estimated payment is ${formatCurrency(payment.monthly)} per month.`
    },
    {
      question: "Do these estimates affect credit score?",
      answer: "No. Calculator scenarios are informational and do not trigger a credit inquiry."
    }
  ];

  const mainContent = `${renderCalculatorSection({
    amount: type.defaultAmount,
    apr: type.apr,
    termMonths: type.defaultTermMonths,
    heading: `${type.title} (Canada)`,
    lead: type.summary,
    buttonLabel: "Run Calculation"
  })}
<section class="section"><div class="container"><h2>Example Monthly Payment</h2><p>A $${numberWithCommas(
    type.defaultAmount
  )} ${escapeHtml(type.displayName.toLowerCase())} in ${escapeHtml(province.name)} at ${type.apr.toFixed(
    1
  )}% APR over ${type.defaultTermMonths} months is approximately <strong>${formatCurrency(
    payment.monthly
  )}</strong> monthly.</p></div></section>
${renderTermComparisonTable(type.defaultAmount, type.apr)}
${renderExamplePaymentTable(type.apr, 36)}
${renderRelatedCalculatorsSection({ amount: type.defaultAmount, provinceSlug: province.slug, typeSlug: type.slug })}
${renderFaqSection(faqItems)}`;

  return renderLayout({
    title: `${type.title} Canada`,
    description: type.summary,
    keywords: `${type.title.toLowerCase()}, canada loan calculator, monthly payment estimator`,
    canonicalPath,
    heroTitle: type.title,
    heroText: type.summary,
    prefillAmount: type.defaultAmount,
    prefillApr: type.apr,
    prefillTermYears: Math.round(type.defaultTermMonths / 12),
    mainContent,
    secondaryCtaLabel: "View Programmatic Hub",
    secondaryCtaHref: "/loan-calculators/",
    schemas: [
      buildFaqSchema(faqItems),
      buildWebApplicationSchema({ title: type.title, description: type.summary, canonicalPath }),
      buildFinancialProductSchema({ title: `${type.displayName} Example`, canonicalPath, apr: type.apr, amount: type.defaultAmount })
    ]
  });
}

function renderGuidePage(guide) {
  const amount = 5000;
  const province = PROVINCES.find((item) => item.slug === "ontario") || PROVINCES[0];
  const apr = 11.2;
  const canonicalPath = guideUrl(guide.slug);

  const faqItems = [
    {
      question: "Should I use one scenario or multiple scenarios?",
      answer: "Run multiple scenarios to understand payment risk under different terms and APR assumptions."
    },
    {
      question: "Where can I continue after reading this guide?",
      answer: "Use the linked calculators and province pages to test a realistic repayment plan."
    }
  ];

  const guideContent = guide.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");

  const mainContent = `${renderCalculatorSection({
    amount,
    apr,
    termMonths: 36,
    heading: `${guide.title} Calculator Example`,
    lead: "Use this calculator while reading the guide to validate each concept with real numbers.",
    buttonLabel: "Update Scenario"
  })}
<section class="section"><div class="container"><h2>${escapeHtml(guide.title)}</h2>${guideContent}</div></section>
${renderTermComparisonTable(amount, apr)}
${renderExamplePaymentTable(apr, 36)}
${renderRelatedCalculatorsSection({ amount, provinceSlug: province.slug, typeSlug: "loan-calculator", excludeGuideSlug: guide.slug })}
${renderFaqSection(faqItems)}`;

  return renderLayout({
    title: guide.title,
    description: guide.description,
    keywords: `${guide.title.toLowerCase()}, loan guide canada, loan calculator education`,
    canonicalPath,
    heroTitle: guide.title,
    heroText: guide.description,
    prefillAmount: amount,
    prefillApr: apr,
    prefillTermYears: 3,
    mainContent,
    bodyClass: "page-resources",
    secondaryCtaLabel: "Open Loan Calculator",
    secondaryCtaHref: "/loan-calculator/",
    schemas: [
      buildFaqSchema(faqItems),
      buildWebApplicationSchema({ title: `${guide.title} - Loan Calculator`, description: guide.description, canonicalPath }),
      buildFinancialProductSchema({ title: `${guide.title} Example Product`, canonicalPath, apr, amount })
    ]
  });
}

function renderComboPage(type, amount, province) {
  const canonicalPath = comboUrl(type.slug, amount, province.slug);
  const payment = calculatePayment(amount, type.apr, 36);

  const faqItems = [
    {
      question: `What is the monthly payment for a $${numberWithCommas(amount)} ${type.displayName.toLowerCase()} in ${province.name}?`,
      answer: `At ${type.apr.toFixed(1)}% APR over 36 months, estimated monthly payment is ${formatCurrency(
        payment.monthly
      )}.`
    },
    {
      question: "Can I compare different terms on this page?",
      answer: "Yes. Use the term comparison table and interactive calculator to compare options."
    }
  ];

  const mainContent = `${renderCalculatorSection({
    amount,
    apr: type.apr,
    termMonths: 36,
    heading: `${type.title} for $${numberWithCommas(amount)} in ${province.name}`,
    lead: "Long-tail calculator page with amount, province context, and repayment comparisons.",
    buttonLabel: "Recalculate"
  })}
<section class="section"><div class="container"><h2>Local Loan Overview</h2><p>${escapeHtml(
    province.overview
  )}</p><p>Common city searches in ${escapeHtml(province.name)} include ${province.cities
    .map((city) => escapeHtml(city))
    .join(", ")}.</p><p>Example monthly payment: <strong>${formatCurrency(payment.monthly)}</strong>.</p></div></section>
${renderTermComparisonTable(amount, type.apr)}
${renderExamplePaymentTable(type.apr, 36)}
${renderRelatedCalculatorsSection({ amount, provinceSlug: province.slug, typeSlug: type.slug })}
${renderFaqSection(faqItems)}`;

  return renderLayout({
    title: `${type.title} for $${numberWithCommas(amount)} in ${province.name}`,
    description: `Estimate a $${numberWithCommas(amount)} ${type.displayName.toLowerCase()} payment in ${province.name}.`,
    keywords: `${type.displayName.toLowerCase()} ${province.name.toLowerCase()} ${amount} loan calculator`,
    canonicalPath,
    heroTitle: `${type.title} for $${numberWithCommas(amount)} in ${province.name}`,
    heroText: "Amount + province landing page with calculator, term table, and internal links.",
    prefillAmount: amount,
    prefillApr: type.apr,
    prefillTermYears: 3,
    mainContent,
    secondaryCtaLabel: "Apply",
    secondaryCtaHref: `/apply/?province=${province.code}`,
    schemas: [
      buildFaqSchema(faqItems),
      buildWebApplicationSchema({ title: `${type.title} ${province.name}`, description: "Province and amount loan calculator", canonicalPath }),
      buildFinancialProductSchema({ title: `${type.displayName} ${province.name} Example`, canonicalPath, apr: type.apr, amount, provinceName: province.name })
    ]
  });
}

function renderAmountHubPage() {
  const rows = LOAN_AMOUNTS.map((amount) => {
    const payment = calculatePayment(amount, 11.2, 36);
    return `<tr><td><a href="${amountPageUrl(amount)}">$${numberWithCommas(amount)} loan calculator</a></td><td>${formatCurrency(
      payment.monthly
    )}</td></tr>`;
  }).join("\n");

  return renderLayout({
    title: "Loan Amount Calculator Pages",
    description: "Browse amount-specific calculator pages from $500 to $20,000.",
    keywords: "loan calculator by amount canada, payment table loan amount",
    canonicalPath: "/loan-calculator/",
    heroTitle: "Loan Amount Pages",
    heroText: "Choose a specific amount to view monthly estimates, term comparisons, and related calculators.",
    mainContent: `<section class="section"><div class="container"><h2>Amount Pages</h2><div class="table-wrap"><table><thead><tr><th>Amount Page</th><th>Example Monthly Payment</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`,
    bodyClass: "page-resources",
    primaryCtaLabel: "Open $5,000 Page",
    primaryCtaHref: "/loan-calculator/5000/",
    secondaryCtaLabel: "View Ecosystem",
    secondaryCtaHref: "/loan-calculators/"
  });
}

function renderProvinceHubPage() {
  const cards = PROVINCES.map(
    (province) => `<article class="card"><h3><a href="${provincePageUrl(province.slug)}">Loans in ${escapeHtml(
      province.name
    )}</a></h3><p>${escapeHtml(province.overview)}</p><p>Cities: ${province.cities
      .slice(0, 3)
      .map((city) => escapeHtml(city))
      .join(", ")}.</p></article>`
  ).join("\n");

  return renderLayout({
    title: "Loan Pages by Province",
    description: "Province-focused calculator pages across major Canadian regions.",
    keywords: "province loan calculator canada, loans in ontario, loans in alberta",
    canonicalPath: "/provinces/",
    heroTitle: "Province Loan Pages",
    heroText: "Open province pages for local loan context, city mentions, and amount links.",
    mainContent: `<section class="section"><div class="container"><h2>Provinces</h2><div class="framework-grid">${cards}</div></div></section>`,
    bodyClass: "page-resources",
    primaryCtaLabel: "Open Ontario",
    primaryCtaHref: "/loans-in/ontario/",
    secondaryCtaLabel: "Browse Amount Pages",
    secondaryCtaHref: "/loan-calculator/"
  });
}

function renderEducationHubPage() {
  const cards = EDUCATION_GUIDES.map(
    (guide) => `<article class="card"><h3><a href="${guideUrl(guide.slug)}">${escapeHtml(
      guide.title
    )}</a></h3><p>${escapeHtml(guide.description)}</p></article>`
  ).join("\n");

  return renderLayout({
    title: "Loan Education Hub",
    description: "Micro-guides on loan math, approval factors, amortization, and affordability.",
    keywords: "loan education guides canada, loan amortization guide",
    canonicalPath: "/learn/",
    heroTitle: "Education Hub",
    heroText: "Read practical loan guides and jump back to calculators to test real scenarios.",
    mainContent: `<section class="section"><div class="container"><h2>Micro-Guides</h2><div class="framework-grid">${cards}</div></div></section>`,
    bodyClass: "page-resources",
    primaryCtaLabel: "Open Interest Guide",
    primaryCtaHref: "/learn/how-loan-interest-works/",
    secondaryCtaLabel: "Open Calculator",
    secondaryCtaHref: "/loan-calculator/"
  });
}

function renderProgrammaticHubPage(totalPages) {
  const scenarioCount =
    SCENARIO_AMOUNTS.length * SCENARIO_STRATEGIES.length * (PROVINCES.length + 1);

  return renderLayout({
    title: "Programmatic Loan Calculator Ecosystem",
    description: `Structured loan calculator network with ${totalPages} generated pages for long-tail Canadian search queries.`,
    keywords: "loan calculator ecosystem canada, programmatic seo loan calculator",
    canonicalPath: "/loan-calculators/",
    heroTitle: "Loan Calculator Ecosystem",
    heroText: "Interlinked amount pages, province pages, loan-type pages, and guides built for long-tail discovery and utility.",
    mainContent: `<section class="section"><div class="container"><h2>Page Families</h2><div class="framework-grid"><article class="card"><h3>Loan Amount Pages</h3><p>${LOAN_AMOUNTS.length} pages under /loan-calculator/{amount}.</p></article><article class="card"><h3>Province Pages</h3><p>${PROVINCES.length} pages with city mentions and local examples.</p></article><article class="card"><h3>Loan Type Pages</h3><p>${LOAN_TYPES.length} pages for major consumer loan intents.</p></article><article class="card"><h3>Education Guides</h3><p>${EDUCATION_GUIDES.length} linked micro-guides.</p></article><article class="card"><h3>Scenario Pages</h3><p>${scenarioCount} pages under /scenarios/ plus a dedicated strategy hub.</p><p><a href="${scenarioHubUrl()}">Open loan strategy scenarios</a></p></article></div><p>Total generated pages in this release: <strong>${totalPages}</strong>.</p></div></section>`,
    bodyClass: "page-resources",
    primaryCtaLabel: "Open Amount Hub",
    primaryCtaHref: "/loan-calculator/",
    secondaryCtaLabel: "Open Scenario Hub",
    secondaryCtaHref: scenarioHubUrl()
  });
}

function renderExamplePaymentsPage() {
  const rows = LOAN_AMOUNTS.map((amount) => {
    const payment = calculatePayment(amount, 11.2, 36);
    return `<tr><td>$${numberWithCommas(amount)}</td><td>${formatCurrency(payment.monthly)}</td><td><a href="${amountPageUrl(
      amount
    )}">Open page</a></td></tr>`;
  }).join("\n");

  return renderLayout({
    title: "Example Monthly Payment Library",
    description: "Baseline payment examples for key loan amounts in Canada.",
    keywords: "example monthly payment loan canada",
    canonicalPath: "/example-payments/",
    heroTitle: "Example Monthly Payments",
    heroText: "Quickly compare common loan amounts, then open the matching amount page.",
    mainContent: `<section class="section"><div class="container"><h2>Example Payment Table</h2><div class="table-wrap"><table><thead><tr><th>Amount</th><th>Monthly Payment</th><th>Calculator</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`,
    bodyClass: "page-resources",
    primaryCtaLabel: "Open $5,000 Page",
    primaryCtaHref: "/loan-calculator/5000/",
    secondaryCtaLabel: "Open Amount Hub",
    secondaryCtaHref: "/loan-calculator/"
  });
}

function renderScenarioPage({ amount, strategy, province }) {
  const provinceForLinks = province || PROVINCES.find((item) => item.slug === "ontario") || PROVINCES[0];
  const config = strategy.buildConfig(amount, province);
  const comparisonRows = buildScenarioComparisonRows(strategy, config);
  const summary = buildScenarioDecisionSummary(comparisonRows);
  const canonicalPath = scenarioPageUrl(amount, strategy.pageSlug, province ? province.slug : undefined);
  const pageQuestion = strategy.pageQuestion.replace("${amount}", `$${numberWithCommas(amount)}`);
  const pageTitleSuffix = province ? ` in ${province.name}` : "";
  const simulatorHref = `/loan-scenario-simulator/?amount=${config.amount}&rate=${config.apr.toFixed(
    1
  )}&termMonths=${config.baseTermMonths}&extraPayment=${config.extraPayment}&strategy=${encodeURIComponent(
    strategy.key
  )}`;
  const relatedStrategies = SCENARIO_STRATEGIES.filter((item) => item.key !== strategy.key)
    .slice(0, 4)
    .map(
      (item) =>
        `<li><a href="${scenarioPageUrl(amount, item.pageSlug, province ? province.slug : undefined)}">${escapeHtml(
          strategyLabel(item.key)
        )} strategy for $${numberWithCommas(amount)}</a></li>`
    )
    .join("\n");
  const relatedAmounts = SCENARIO_AMOUNTS.filter((value) => value !== amount)
    .slice(0, 6)
    .map(
      (value) =>
        `<li><a href="${scenarioPageUrl(value, strategy.pageSlug, province ? province.slug : undefined)}">${escapeHtml(
          strategyLabel(strategy.key)
        )} for $${numberWithCommas(value)}</a></li>`
    )
    .join("\n");

  const faqItems = [
    {
      question: "Does paying extra reduce loan interest?",
      answer:
        "In most amortized loans, higher monthly payments reduce principal faster, which typically lowers total interest paid."
    },
    {
      question: "Is a shorter loan term better?",
      answer:
        "A shorter term usually lowers total interest but increases monthly payment. The better choice depends on cash-flow stability."
    }
  ];

  const chartCards = comparisonRows
    .map(
      (row) =>
        `<article class="card"><h3>${escapeHtml(row.label)}</h3><p>Monthly payment: <strong>${formatCurrency(
          row.monthly
        )}</strong></p><p>Total interest: <strong>${formatCurrency(
          row.totalInterest
        )}</strong></p><p>Duration: <strong>${row.months} months</strong></p></article>`
    )
    .join("\n");

  const mainContent = `<section class="section"><div class="container"><h2>Scenario Explanation</h2><p>${escapeHtml(
    strategy.intro
  )}</p><p>This page answers search intent around "${escapeHtml(strategy.queryIntent)}"${province ? ` for ${escapeHtml(
    province.name
  )} borrowers` : ""} with pre-filled assumptions and side-by-side outcomes.</p></div></section>
${renderScenarioComparisonTable(comparisonRows)}
<section class="section"><div class="container"><h2>Charts</h2><div class="framework-grid">${chartCards}</div></div></section>
<section class="section"><div class="container"><h2>Decision Summary</h2><p>${escapeHtml(summary)}</p></div></section>
<section class="section"><div class="container"><h2>Related Scenarios</h2><div class="framework-grid"><article class="card"><h3>Same Amount</h3><ul>${relatedStrategies}</ul></article><article class="card"><h3>Same Strategy</h3><ul>${relatedAmounts}</ul></article><article class="card"><h3>Internal Links</h3><ul><li><a href="${amountPageUrl(
    amount
  )}">$${numberWithCommas(amount)} Loan Calculator</a></li><li><a href="${provincePageUrl(
    provinceForLinks.slug
  )}">Loans in ${escapeHtml(provinceForLinks.name)}</a></li><li><a href="${guideUrl(
    "how-loan-interest-works"
  )}">How Loan Interest Works</a></li><li><a href="/loan-scenario-simulator/">Financial Path Explorer</a></li></ul></article></div></div></section>
${renderCalculatorSection({
    amount: config.amount,
    apr: config.apr,
    termMonths: config.baseTermMonths,
    heading: `${pageQuestion}${pageTitleSuffix}`,
    lead: "Calculator access with scenario defaults. Adjust the inputs to test your own version of this decision.",
    buttonLabel: "Recalculate Scenario"
  })}
<section class="section"><div class="container"><h2>Calculator Access</h2><p>Open the strategy simulator with this scenario pre-filled: <a href="${simulatorHref}">Launch Financial Path Explorer</a>.</p></div></section>
${renderFaqSection(faqItems)}`;

  return renderLayout({
    title: `${pageQuestion}${pageTitleSuffix}`,
    description: `Scenario comparison for ${strategyLabel(strategy.key).toLowerCase()} on a $${numberWithCommas(
      amount
    )} loan${province ? ` in ${province.name}` : ""}, including table, charts, and a pre-filled calculator.`,
    keywords: `${strategy.queryIntent}, ${amount} loan strategy, loan scenario calculator`,
    canonicalPath,
    heroTitle: `${pageQuestion}${pageTitleSuffix}`,
    heroText:
      "Compare strategy outcomes with pre-filled assumptions, clear tables, and direct calculator access for custom adjustments.",
    prefillAmount: config.amount,
    prefillApr: config.apr,
    prefillTermYears: Math.round(config.baseTermMonths / 12),
    mainContent,
    secondaryCtaLabel: "Open Scenario Hub",
    secondaryCtaHref: scenarioHubUrl(),
    schemas: [
      buildFaqSchema(faqItems),
      buildWebApplicationSchema({ title: pageQuestion, description: strategy.intro, canonicalPath }),
      buildFinancialProductSchema({
        title: `${strategyLabel(strategy.key)} Scenario${province ? ` ${province.name}` : ""}`,
        canonicalPath,
        apr: config.apr,
        amount: config.amount,
        provinceName: province ? province.name : undefined
      }),
      buildHowToSchema({
        name: pageQuestion,
        canonicalPath,
        steps: [
          "Review scenario assumptions including amount, APR, and repayment term.",
          "Compare strategies using monthly payment, total interest, and duration.",
          "Open the calculator to test custom values and choose the lowest-risk option."
        ]
      })
    ]
  });
}

function renderScenarioHubPage() {
  const baseScenarioCount = SCENARIO_AMOUNTS.length * SCENARIO_STRATEGIES.length;
  const provinceScenarioCount = baseScenarioCount * PROVINCES.length;

  const categoryCards = Array.from(new Set(SCENARIO_STRATEGIES.map((strategy) => strategy.category)))
    .map((category) => {
      const sampleLinks = SCENARIO_STRATEGIES.filter((strategy) => strategy.category === category)
        .slice(0, 2)
        .map(
          (strategy) =>
            `<li><a href="${scenarioPageUrl(5000, strategy.pageSlug)}">${escapeHtml(strategyLabel(strategy.key))} on $5,000</a></li>`
        )
        .join("\n");
      return `<article class="card"><h3>${escapeHtml(category)}</h3><ul>${sampleLinks}</ul></article>`;
    })
    .join("\n");

  const allRows = SCENARIO_AMOUNTS.map((amount) => {
    const links = SCENARIO_STRATEGIES.map(
      (strategy) =>
        `<a href="${scenarioPageUrl(amount, strategy.pageSlug)}">${escapeHtml(strategyLabel(strategy.key))}</a>`
    ).join(" | ");
    return `<tr><td>$${numberWithCommas(amount)}</td><td>${links}</td></tr>`;
  }).join("\n");

  return renderLayout({
    title: "Loan Strategy Scenarios",
    description:
      "Scenario hub for strategy-specific loan pages with pre-filled simulation assumptions, comparisons, and decision summaries.",
    keywords: "loan strategy scenarios, pay extra on loan calculator, short vs long term loan",
    canonicalPath: scenarioHubUrl(),
    heroTitle: "Loan Strategy Scenarios",
    heroText:
      "Explore scenario pages by amount and strategy intent. Each page includes a pre-filled simulation, comparison table, summary, and calculator access.",
    mainContent: `<section class="section"><div class="container"><h2>Scenario Categories</h2><div class="framework-grid">${categoryCards}</div></div></section><section class="section"><div class="container"><h2>Scenario Matrix</h2><p>${baseScenarioCount} base scenarios (${SCENARIO_AMOUNTS.length} amounts × ${SCENARIO_STRATEGIES.length} strategies) and ${provinceScenarioCount} province variants are generated automatically.</p><div class="table-wrap"><table><thead><tr><th>Loan Amount</th><th>Strategy Pages</th></tr></thead><tbody>${allRows}</tbody></table></div></div></section>`,
    bodyClass: "page-resources",
    primaryCtaLabel: "Open $5,000 Extra Payment",
    primaryCtaHref: "/scenarios/5000-loan-extra-payments/",
    secondaryCtaLabel: "Open Financial Path Explorer",
    secondaryCtaHref: "/loan-scenario-simulator/"
  });
}

async function removeGeneratedDirectories() {
  const generatedRoots = [
    "loan-calculators",
    "loan-calculator",
    "emergency-loan-calculator",
    "bad-credit-loan-calculator",
    "debt-consolidation-loan-calculator",
    "auto-loan-calculator",
    "provinces",
    "loans-in",
    "learn",
    "example-payments",
    "scenarios",
    "loan-strategy-scenarios"
  ];

  for (const relativeDir of generatedRoots) {
    await fs.rm(path.join(ROOT_DIR, relativeDir), { recursive: true, force: true });
  }

  const rootEntries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isDirectory() && /^loan-calculator-\d+$/.test(entry.name)) {
      await fs.rm(path.join(ROOT_DIR, entry.name), { recursive: true, force: true });
    }
  }
}

async function writePage(relativeDir, html) {
  const outputDir = path.join(ROOT_DIR, relativeDir);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "index.html"), html, "utf8");
}

async function listHtmlPages(startDir, root = startDir) {
  const entries = await fs.readdir(startDir, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.name === "node_modules" || entry.name === "assets" || entry.name === "data") {
      continue;
    }

    const fullPath = path.join(startDir, entry.name);

    if (entry.isDirectory()) {
      const childPages = await listHtmlPages(fullPath, root);
      pages.push(...childPages);
      continue;
    }

    if (entry.isFile() && entry.name === "index.html") {
      const relDir = path.relative(root, path.dirname(fullPath));
      const normalized = relDir === "" ? "/" : `/${relDir.replace(/\\/g, "/")}/`;
      pages.push(normalized);
    }
  }

  return pages;
}

async function writeSitemap() {
  const pages = await listHtmlPages(ROOT_DIR);
  const uniquePages = Array.from(new Set(pages)).sort();
  const body = uniquePages.map((page) => `  <url><loc>${DOMAIN}${page}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  await fs.writeFile(path.join(ROOT_DIR, "sitemap.xml"), xml, "utf8");
  return uniquePages.length;
}

async function generate() {
  await removeGeneratedDirectories();

  let comboCount = 0;
  let scenarioCount = 0;

  for (const type of LOAN_TYPES) {
    await writePage(type.slug, renderLoanTypePage(type));

    for (const amount of LOAN_AMOUNTS) {
      if (type.slug === "loan-calculator") {
        await writePage(path.join("loan-calculator", String(amount)), renderAmountPage(amount));
      }

      for (const province of PROVINCES) {
        await writePage(path.join(type.slug, String(amount), province.slug), renderComboPage(type, amount, province));
        comboCount += 1;
      }
    }
  }

  for (const province of PROVINCES) {
    await writePage(path.join("loans-in", province.slug), renderProvincePage(province));
  }

  for (const guide of EDUCATION_GUIDES) {
    await writePage(path.join("learn", guide.slug), renderGuidePage(guide));
  }

  for (const amount of SCENARIO_AMOUNTS) {
    for (const strategy of SCENARIO_STRATEGIES) {
      await writePage(
        path.join("scenarios", `${amount}-loan-${strategy.pageSlug}`),
        renderScenarioPage({ amount, strategy })
      );
      scenarioCount += 1;

      for (const province of PROVINCES) {
        await writePage(
          path.join("scenarios", `${amount}-loan-${strategy.pageSlug}-${province.slug}`),
          renderScenarioPage({ amount, strategy, province })
        );
        scenarioCount += 1;
      }
    }
  }

  await writePage("loan-calculator", renderAmountHubPage());
  await writePage("provinces", renderProvinceHubPage());
  await writePage("learn", renderEducationHubPage());
  await writePage("example-payments", renderExamplePaymentsPage());
  await writePage("loan-strategy-scenarios", renderScenarioHubPage());

  const totalGeneratedPages =
    comboCount +
    scenarioCount +
    LOAN_TYPES.length +
    LOAN_AMOUNTS.length +
    PROVINCES.length +
    EDUCATION_GUIDES.length +
    5;

  await writePage("loan-calculators", renderProgrammaticHubPage(totalGeneratedPages));

  const sitemapCount = await writeSitemap();

  console.log(`Generated ${comboCount} combination pages.`);
  console.log(`Generated ${scenarioCount} scenario pages.`);
  console.log(`Generated ${totalGeneratedPages} structured ecosystem pages.`);
  console.log(`Updated sitemap.xml with ${sitemapCount} URLs.`);
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
