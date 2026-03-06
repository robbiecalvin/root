(function () {
    "use strict";

    var currency = new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0
    });

    var currencyPrecise = new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 2
    });

    var monthYear = new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric" });

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toNumber(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function monthlyPayment(principal, annualRate, months) {
        var p = Math.max(0, principal);
        var n = Math.max(1, Math.round(months));
        var r = Math.max(0, annualRate) / 1200;

        if (p === 0) {
            return 0;
        }

        if (r === 0) {
            return p / n;
        }

        return p * (r / (1 - Math.pow(1 + r, -n)));
    }

    function principalFromPayment(payment, annualRate, months) {
        var pmt = Math.max(0, payment);
        var n = Math.max(1, Math.round(months));
        var r = Math.max(0, annualRate) / 1200;

        if (pmt === 0) {
            return 0;
        }

        if (r === 0) {
            return pmt * n;
        }

        return pmt * ((1 - Math.pow(1 + r, -n)) / r);
    }

    function payoffDateFromMonths(months) {
        var date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() + Math.max(0, Math.round(months)));
        return monthYear.format(date);
    }

    function amortize(principal, annualRate, months, extraPayment) {
        var balance = Math.max(0, principal);
        var term = Math.max(1, Math.round(months));
        var basePayment = monthlyPayment(balance, annualRate, term);
        var extra = Math.max(0, extraPayment || 0);
        var totalInterest = 0;
        var totalPrincipal = 0;
        var rows = [];
        var month = 0;

        while (balance > 0.01 && month < term + 360) {
            month += 1;
            var monthlyRate = Math.max(0, annualRate) / 1200;
            var interestPaid = monthlyRate > 0 ? balance * monthlyRate : 0;
            var paymentThisMonth = basePayment + extra;
            var principalPaid = paymentThisMonth - interestPaid;

            if (principalPaid <= 0) {
                break;
            }

            if (principalPaid > balance) {
                principalPaid = balance;
                paymentThisMonth = principalPaid + interestPaid;
            }

            balance = Math.max(0, balance - principalPaid);
            totalInterest += interestPaid;
            totalPrincipal += principalPaid;

            rows.push({
                month: month,
                balance: balance,
                interestPaid: interestPaid,
                principalPaid: principalPaid,
                payment: paymentThisMonth
            });
        }

        return {
            rows: rows,
            monthlyPayment: rows.length ? rows[0].payment : basePayment,
            totalInterest: totalInterest,
            totalPrincipal: totalPrincipal,
            totalRepayment: totalPrincipal + totalInterest,
            payoffMonths: rows.length ? rows[rows.length - 1].month : term
        };
    }

    function drawLineChart(canvas, rows, valueKey, color, startAtZero) {
        if (!canvas || !canvas.getContext) {
            return;
        }

        var ctx = canvas.getContext("2d");
        var width = canvas.width;
        var height = canvas.height;
        var left = 48;
        var right = 14;
        var top = 14;
        var bottom = 28;

        var values = rows.map(function (row) { return row[valueKey]; });
        var min = startAtZero ? 0 : Math.min.apply(null, values.concat([0]));
        var max = Math.max.apply(null, values.concat([1]));

        if (max === min) {
            max += 1;
        }

        function x(index) {
            if (rows.length <= 1) {
                return left;
            }
            return left + (index / (rows.length - 1)) * (width - left - right);
        }

        function y(value) {
            return height - bottom - ((value - min) / (max - min)) * (height - top - bottom);
        }

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#0b1320";
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.lineWidth = 1;
        for (var i = 0; i <= 4; i += 1) {
            var gridY = top + ((height - top - bottom) * i) / 4;
            ctx.beginPath();
            ctx.moveTo(left, gridY);
            ctx.lineTo(width - right, gridY);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, height - bottom);
        ctx.lineTo(width - right, height - bottom);
        ctx.stroke();

        if (!rows.length) {
            return;
        }

        ctx.beginPath();
        rows.forEach(function (row, index) {
            var pointX = x(index);
            var pointY = y(row[valueKey]);
            if (index === 0) {
                ctx.moveTo(pointX, pointY);
            } else {
                ctx.lineTo(pointX, pointY);
            }
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.3;
        ctx.stroke();
    }

    function createDebtRow(balance, rate, term) {
        var row = document.createElement("div");
        row.className = "debt-row";
        row.innerHTML = "" +
            "<label>Balance<input class=\"debt-balance\" type=\"number\" min=\"0\" step=\"100\" value=\"" + String(balance) + "\"></label>" +
            "<label>Rate %<input class=\"debt-rate\" type=\"number\" min=\"0\" max=\"35\" step=\"0.1\" value=\"" + String(rate) + "\"></label>" +
            "<label>Term (months)<input class=\"debt-term\" type=\"number\" min=\"1\" max=\"240\" step=\"1\" value=\"" + String(term) + "\"></label>" +
            "<button type=\"button\" class=\"btn btn-secondary debt-remove\">Remove</button>";
        return row;
    }

    function init() {
        var app = document.getElementById("journeyApp");
        if (!app) {
            return;
        }

        var el = {
            progressFill: document.getElementById("progressFill"),
            stepPills: Array.prototype.slice.call(document.querySelectorAll(".journey-step-pill")),
            panels: Array.prototype.slice.call(document.querySelectorAll(".journey-step")),
            completeButtons: Array.prototype.slice.call(document.querySelectorAll(".complete-step")),
            backButtons: Array.prototype.slice.call(document.querySelectorAll(".step-back")),

            loanAmount: document.getElementById("loanAmount"),
            interestRate: document.getElementById("interestRate"),
            loanTerm: document.getElementById("loanTerm"),
            loanAmountValue: document.getElementById("loanAmountValue"),
            interestRateValue: document.getElementById("interestRateValue"),
            loanTermValue: document.getElementById("loanTermValue"),

            monthlyPayment: document.getElementById("monthlyPayment"),
            totalRepayment: document.getElementById("totalRepayment"),
            totalInterest: document.getElementById("totalInterest"),
            payoffDate: document.getElementById("payoffDate"),

            scenarioCardGrid: document.getElementById("scenarioCardGrid"),
            scenarioExplainer: document.getElementById("scenarioExplainer"),

            dtiValue: document.getElementById("dtiValue"),
            stressValue: document.getElementById("stressValue"),
            healthScoreValue: document.getElementById("healthScoreValue"),
            dtiMeterBar: document.getElementById("dtiMeterBar"),
            stressMeterBar: document.getElementById("stressMeterBar"),
            healthMeterBar: document.getElementById("healthMeterBar"),

            extraMonthlyPayment: document.getElementById("extraMonthlyPayment"),
            refinanceRate: document.getElementById("refinanceRate"),
            incomeChange: document.getElementById("incomeChange"),
            unexpectedExpense: document.getElementById("unexpectedExpense"),
            extraMonthlyPaymentValue: document.getElementById("extraMonthlyPaymentValue"),
            refinanceRateValue: document.getElementById("refinanceRateValue"),
            incomeChangeValue: document.getElementById("incomeChangeValue"),
            unexpectedExpenseValue: document.getElementById("unexpectedExpenseValue"),

            strategyPayoff: document.getElementById("strategyPayoff"),
            strategyInterestDelta: document.getElementById("strategyInterestDelta"),
            strategyBuffer: document.getElementById("strategyBuffer"),

            balanceChart: document.getElementById("balanceChart"),
            cashflowChart: document.getElementById("cashflowChart"),
            netPositionChart: document.getElementById("netPositionChart"),

            recommendationList: document.getElementById("recommendationList"),

            extraPaymentCalculator: document.getElementById("extraPaymentCalculator"),
            extraInterestSaved: document.getElementById("extraInterestSaved"),
            extraPayoffReduction: document.getElementById("extraPayoffReduction"),

            borrowIncome: document.getElementById("borrowIncome"),
            borrowExpenses: document.getElementById("borrowExpenses"),
            borrowDebts: document.getElementById("borrowDebts"),
            borrowRate: document.getElementById("borrowRate"),
            borrowMaxLoan: document.getElementById("borrowMaxLoan"),

            debtRows: document.getElementById("debtRows"),
            addDebtRow: document.getElementById("addDebtRow"),
            currentDebtPayment: document.getElementById("currentDebtPayment"),
            consolidatedDebtPayment: document.getElementById("consolidatedDebtPayment"),
            debtSavings: document.getElementById("debtSavings")
        };

        var activeStep = 1;
        var maxUnlocked = 1;

        function updateStepUI() {
            el.panels.forEach(function (panel) {
                var step = Number(panel.getAttribute("data-step-panel"));
                var isActive = step === activeStep;
                panel.classList.toggle("is-active", isActive);
                panel.hidden = !isActive;
            });

            el.stepPills.forEach(function (pill) {
                var step = Number(pill.getAttribute("data-step"));
                var unlocked = step <= maxUnlocked;
                pill.disabled = !unlocked;
                pill.classList.toggle("is-active", step === activeStep);
                pill.classList.toggle("is-locked", !unlocked);
            });

            var progress = ((activeStep - 1) / 4) * 100;
            el.progressFill.style.width = progress + "%";
        }

        function goToStep(step) {
            if (step < 1 || step > 5 || step > maxUnlocked) {
                return;
            }
            activeStep = step;
            updateStepUI();
        }

        function state() {
            var loanAmount = toNumber(el.loanAmount.value, 35000);
            var interestRate = toNumber(el.interestRate.value, 9.2);
            var loanTerm = toNumber(el.loanTerm.value, 60);
            var borrowIncome = toNumber(el.borrowIncome.value, 6200);
            var borrowExpenses = toNumber(el.borrowExpenses.value, 2800);
            var borrowDebts = toNumber(el.borrowDebts.value, 500);
            var borrowRate = toNumber(el.borrowRate.value, interestRate);

            return {
                loanAmount: clamp(loanAmount, 1000, 150000),
                interestRate: clamp(interestRate, 1, 35),
                loanTerm: clamp(loanTerm, 12, 120),
                extraMonthlyPayment: clamp(toNumber(el.extraMonthlyPayment.value, 0), 0, 2000),
                refinanceRate: clamp(toNumber(el.refinanceRate.value, 7.2), 1, 30),
                incomeChange: clamp(toNumber(el.incomeChange.value, 0), -2500, 2500),
                unexpectedExpense: clamp(toNumber(el.unexpectedExpense.value, 0), 0, 10000),
                extraPaymentCalculator: Math.max(0, toNumber(el.extraPaymentCalculator.value, 0)),
                borrowIncome: Math.max(0, borrowIncome),
                borrowExpenses: Math.max(0, borrowExpenses),
                borrowDebts: Math.max(0, borrowDebts),
                borrowRate: clamp(borrowRate, 0, 35)
            };
        }

        function updateLabels(s) {
            el.loanAmountValue.textContent = currency.format(s.loanAmount);
            el.interestRateValue.textContent = s.interestRate.toFixed(1) + "%";
            el.loanTermValue.textContent = Math.round(s.loanTerm) + " months";

            el.extraMonthlyPaymentValue.textContent = currency.format(s.extraMonthlyPayment);
            el.refinanceRateValue.textContent = s.refinanceRate.toFixed(1) + "%";
            el.incomeChangeValue.textContent = currency.format(s.incomeChange);
            el.unexpectedExpenseValue.textContent = currency.format(s.unexpectedExpense);
        }

        function updateLoanEstimate(s, baseResult) {
            el.monthlyPayment.textContent = currencyPrecise.format(baseResult.monthlyPayment);
            el.totalRepayment.textContent = currency.format(baseResult.totalRepayment);
            el.totalInterest.textContent = currency.format(baseResult.totalInterest);
            el.payoffDate.textContent = payoffDateFromMonths(baseResult.payoffMonths);
        }

        function updateScenarioCards(s) {
            var scenarios = {
                balanced: Math.round(s.loanTerm),
                lower: Math.min(120, Math.round(s.loanTerm + 24)),
                faster: Math.max(12, Math.round(s.loanTerm - 24))
            };

            var lowestInterestKey = "balanced";
            var lowestInterest = Infinity;

            Object.keys(scenarios).forEach(function (key) {
                var result = amortize(s.loanAmount, s.interestRate, scenarios[key], 0);
                var card = el.scenarioCardGrid.querySelector("[data-scenario-card='" + key + "']");
                if (!card) {
                    return;
                }
                card.querySelector("[data-field='monthly']").textContent = currencyPrecise.format(result.monthlyPayment);
                card.querySelector("[data-field='interest']").textContent = currency.format(result.totalInterest);
                card.querySelector("[data-field='duration']").textContent = result.payoffMonths + " months";

                if (result.totalInterest < lowestInterest) {
                    lowestInterest = result.totalInterest;
                    lowestInterestKey = key;
                }
            });

            var explainerMap = {
                balanced: "Balanced term currently offers the best overall mix of affordability and total cost.",
                lower: "Lower payment eases monthly pressure, but increases total interest paid over time.",
                faster: "Faster payoff reduces interest cost materially, but raises monthly payment requirements."
            };
            el.scenarioExplainer.textContent = explainerMap[lowestInterestKey];
        }

        function stressLabel(dti, monthlyBuffer) {
            if (dti >= 0.43 || monthlyBuffer < 150) {
                return "High";
            }
            if (dti >= 0.33 || monthlyBuffer < 500) {
                return "Moderate";
            }
            return "Low";
        }

        function healthScore(dti, monthlyBuffer, rate) {
            var score = 100;
            if (dti > 0.45) {
                score -= 34;
            } else if (dti > 0.35) {
                score -= 20;
            } else if (dti > 0.25) {
                score -= 8;
            }

            if (monthlyBuffer < 0) {
                score -= 30;
            } else if (monthlyBuffer < 300) {
                score -= 14;
            } else if (monthlyBuffer > 1200) {
                score += 4;
            }

            if (rate > 18) {
                score -= 14;
            } else if (rate > 12) {
                score -= 7;
            }

            return clamp(Math.round(score), 0, 100);
        }

        function updateSnapshot(s, baseResult) {
            var monthlyBuffer = s.borrowIncome - s.borrowExpenses - s.borrowDebts - baseResult.monthlyPayment;
            var dti = (s.borrowDebts + baseResult.monthlyPayment) / Math.max(1, s.borrowIncome);
            var stress = stressLabel(dti, monthlyBuffer);
            var health = healthScore(dti, monthlyBuffer, s.interestRate);

            el.dtiValue.textContent = (dti * 100).toFixed(1) + "%";
            el.stressValue.textContent = stress;
            el.healthScoreValue.textContent = health + " / 100";

            el.dtiMeterBar.style.width = clamp(dti * 100, 0, 100) + "%";
            el.stressMeterBar.style.width = stress === "High" ? "90%" : (stress === "Moderate" ? "62%" : "30%");
            el.healthMeterBar.style.width = health + "%";

            return {
                monthlyBuffer: monthlyBuffer,
                dti: dti,
                stress: stress,
                health: health
            };
        }

        function updateStrategy(s, baseResult) {
            var adjusted = amortize(s.loanAmount, s.refinanceRate, s.loanTerm, s.extraMonthlyPayment);
            var interestDelta = adjusted.totalInterest - baseResult.totalInterest;
            var monthlyBuffer = s.borrowIncome + s.incomeChange - s.borrowExpenses - s.borrowDebts - adjusted.monthlyPayment - (s.unexpectedExpense / 12);

            el.strategyPayoff.textContent = adjusted.payoffMonths + " months";
            el.strategyInterestDelta.textContent = (interestDelta >= 0 ? "+" : "-") + currency.format(Math.abs(interestDelta));
            el.strategyInterestDelta.style.color = interestDelta > 0 ? "#ff6b6b" : "#32d296";
            el.strategyBuffer.textContent = currency.format(monthlyBuffer);
            el.strategyBuffer.style.color = monthlyBuffer < 0 ? "#ff6b6b" : "#32d296";

            var balanceRows = adjusted.rows.map(function (row) {
                return { value: row.balance };
            });

            var cashflowRows = adjusted.rows.map(function (row) {
                return {
                    value: s.borrowIncome + s.incomeChange - s.borrowExpenses - s.borrowDebts - row.payment - (s.unexpectedExpense / 12)
                };
            });

            var savingsStart = 8000;
            var runningSavings = savingsStart;
            var netRows = adjusted.rows.map(function (row) {
                runningSavings += s.borrowIncome + s.incomeChange - s.borrowExpenses - s.borrowDebts - row.payment - (s.unexpectedExpense / 12);
                return { value: runningSavings - row.balance };
            });

            drawLineChart(el.balanceChart, balanceRows, "value", "#2e8cff", true);
            drawLineChart(el.cashflowChart, cashflowRows, "value", "#3de0c5", false);
            drawLineChart(el.netPositionChart, netRows, "value", "#f59e0b", false);

            return adjusted;
        }

        function updateExtraPaymentCalculator(s) {
            var base = amortize(s.loanAmount, s.interestRate, s.loanTerm, 0);
            var accelerated = amortize(s.loanAmount, s.interestRate, s.loanTerm, s.extraPaymentCalculator);
            var interestSaved = Math.max(0, base.totalInterest - accelerated.totalInterest);
            var payoffReduction = Math.max(0, base.payoffMonths - accelerated.payoffMonths);

            el.extraInterestSaved.textContent = currency.format(interestSaved);
            el.extraPayoffReduction.textContent = payoffReduction + " months";
        }

        function updateBorrowingPower(s) {
            var paymentCapacity = Math.min(
                Math.max(0, (s.borrowIncome - s.borrowExpenses - s.borrowDebts) * 0.85),
                Math.max(0, s.borrowIncome * 0.4 - s.borrowDebts)
            );
            var maxLoan = principalFromPayment(paymentCapacity, s.borrowRate, s.loanTerm);
            el.borrowMaxLoan.textContent = currency.format(maxLoan);
        }

        function readDebts() {
            return Array.prototype.map.call(el.debtRows.querySelectorAll(".debt-row"), function (row) {
                return {
                    balance: Math.max(0, toNumber(row.querySelector(".debt-balance").value, 0)),
                    rate: clamp(toNumber(row.querySelector(".debt-rate").value, 0), 0, 35),
                    term: Math.max(1, toNumber(row.querySelector(".debt-term").value, 1))
                };
            }).filter(function (debt) {
                return debt.balance > 0;
            });
        }

        function updateDebtConsolidation() {
            var debts = readDebts();
            if (!debts.length) {
                el.currentDebtPayment.textContent = currencyPrecise.format(0);
                el.consolidatedDebtPayment.textContent = currencyPrecise.format(0);
                el.debtSavings.textContent = currencyPrecise.format(0);
                el.debtSavings.style.color = "";
                return;
            }

            var currentMonthly = debts.reduce(function (sum, debt) {
                return sum + monthlyPayment(debt.balance, debt.rate, debt.term);
            }, 0);

            var totalBalance = debts.reduce(function (sum, debt) { return sum + debt.balance; }, 0);
            var weightedRate = debts.reduce(function (sum, debt) {
                return sum + debt.balance * debt.rate;
            }, 0) / Math.max(1, totalBalance);

            var avgTerm = Math.round(debts.reduce(function (sum, debt) { return sum + debt.term; }, 0) / Math.max(1, debts.length));
            var consolidatedRate = clamp(weightedRate - 1.5, 3, 35);
            var consolidatedMonthly = monthlyPayment(totalBalance, consolidatedRate, avgTerm);
            var savings = currentMonthly - consolidatedMonthly;

            el.currentDebtPayment.textContent = currencyPrecise.format(currentMonthly);
            el.consolidatedDebtPayment.textContent = currencyPrecise.format(consolidatedMonthly);
            el.debtSavings.textContent = currencyPrecise.format(savings);
            el.debtSavings.style.color = savings >= 0 ? "#32d296" : "#ff6b6b";
        }

        function updateRecommendations(s, baseResult, strategyResult, snapshot) {
            var recommendations = [];

            if (snapshot.dti > 0.4) {
                recommendations.push("Debt-to-income is elevated. Reduce loan size or extend term before applying.");
            } else {
                recommendations.push("Debt-to-income is within a manageable range for many lenders.");
            }

            if (strategyResult.totalInterest < baseResult.totalInterest) {
                recommendations.push("Current strategy reduces interest compared with baseline. Keep extra-payment/refinance settings.");
            } else {
                recommendations.push("Current strategy increases total interest. Consider lowering term or adding extra payment.");
            }

            if (snapshot.monthlyBuffer < 0) {
                recommendations.push("Projected monthly buffer is negative. Resolve cash-flow gap before submitting applications.");
            } else {
                recommendations.push("Projected monthly buffer is positive under current assumptions.");
            }

            el.recommendationList.innerHTML = recommendations.map(function (item) {
                return "<li>" + item + "</li>";
            }).join("");
        }

        function render() {
            var s = state();
            updateLabels(s);

            var base = amortize(s.loanAmount, s.interestRate, s.loanTerm, 0);
            updateLoanEstimate(s, base);
            updateScenarioCards(s);
            var snapshot = updateSnapshot(s, base);
            var strategy = updateStrategy(s, base);
            updateExtraPaymentCalculator(s);
            updateBorrowingPower(s);
            updateDebtConsolidation();
            updateRecommendations(s, base, strategy, snapshot);
        }

        el.stepPills.forEach(function (pill) {
            pill.addEventListener("click", function () {
                var step = Number(pill.getAttribute("data-step"));
                goToStep(step);
            });
        });

        el.completeButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                var unlockStep = Number(button.getAttribute("data-unlock-step"));
                maxUnlocked = Math.max(maxUnlocked, unlockStep);
                goToStep(unlockStep);
            });
        });

        el.backButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                var step = Number(button.getAttribute("data-go-step"));
                goToStep(step);
            });
        });

        [
            el.loanAmount,
            el.interestRate,
            el.loanTerm,
            el.extraMonthlyPayment,
            el.refinanceRate,
            el.incomeChange,
            el.unexpectedExpense,
            el.extraPaymentCalculator,
            el.borrowIncome,
            el.borrowExpenses,
            el.borrowDebts,
            el.borrowRate
        ].forEach(function (input) {
            if (!input) {
                return;
            }
            input.addEventListener("input", function () {
                if (input === el.extraMonthlyPayment && document.activeElement === el.extraMonthlyPayment) {
                    el.extraPaymentCalculator.value = String(input.value);
                }
                if (input === el.extraPaymentCalculator && document.activeElement === el.extraPaymentCalculator) {
                    el.extraMonthlyPayment.value = String(Math.round(toNumber(input.value, 0)));
                }
                render();
            });
            input.addEventListener("change", render);
        });

        el.addDebtRow.addEventListener("click", function () {
            el.debtRows.appendChild(createDebtRow(5000, 15.9, 36));
            updateDebtConsolidation();
        });

        el.debtRows.addEventListener("click", function (event) {
            var button = event.target.closest(".debt-remove");
            if (!button) {
                return;
            }
            var row = button.closest(".debt-row");
            if (row) {
                row.remove();
                updateDebtConsolidation();
            }
        });

        el.debtRows.addEventListener("input", updateDebtConsolidation);
        el.debtRows.addEventListener("change", updateDebtConsolidation);

        el.debtRows.appendChild(createDebtRow(8200, 19.9, 48));
        el.debtRows.appendChild(createDebtRow(4300, 12.5, 30));

        updateStepUI();
        render();
    }

    document.addEventListener("DOMContentLoaded", init);
}());
