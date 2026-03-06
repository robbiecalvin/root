(function () {
    "use strict";

    var currency = new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0
    });

    var preciseCurrency = new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    var percent = new Intl.NumberFormat("en-CA", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });

    var state = {
        income: 6200,
        expenses: 3200,
        existingDebts: 650,
        savings: 8500,
        loanAmount: 18000,
        apr: 11.2,
        termMonths: 48,
        startMonth: "",
        loanPurpose: "personal",
        extraPayment: 100,
        shocks: {
            rateIncrease: 1.5,
            incomeDrop: 300,
            oneTimeExpense: 800,
            recurringExpense: 150
        },
        strategySelection: "balanced",
        pathSelection: {
            standard: true,
            extra: true,
            shorter: true,
            longer: true,
            delay: true,
            consolidation: true
        },
        debtRows: [
            { id: 1, name: "Credit card", balance: 4200, rate: 19.9, payment: 180 },
            { id: 2, name: "Auto loan", balance: 7600, rate: 8.4, payment: 270 },
            { id: 3, name: "Line of credit", balance: 2900, rate: 12.7, payment: 95 }
        ]
    };

    var defaultState;
    var debtRowCounter = 3;
    var latestResults = null;

    var calculatorEngine = {
        monthlyPayment: function (principal, apr, months) {
            var p = Math.max(0, Number(principal) || 0);
            var n = Math.max(1, Math.round(Number(months) || 0));
            var monthlyRate = Math.max(0, Number(apr) || 0) / 1200;

            if (p === 0) {
                return 0;
            }

            if (monthlyRate === 0) {
                return p / n;
            }

            return p * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -n)));
        },

        maxPrincipalFromPayment: function (payment, apr, months) {
            var m = Math.max(0, Number(payment) || 0);
            var n = Math.max(1, Math.round(Number(months) || 0));
            var monthlyRate = Math.max(0, Number(apr) || 0) / 1200;

            if (monthlyRate === 0) {
                return m * n;
            }

            return m * ((1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate);
        },

        amortization: function (principal, apr, months, extraPayment, income, expenses, existingDebt, savingsStart, startMonth) {
            var balance = Math.max(0, principal);
            var n = Math.max(1, Math.round(months));
            var scheduledPayment = this.monthlyPayment(balance, apr, n);
            var totalInterest = 0;
            var totalPrincipalPaid = 0;
            var rows = [];
            var savings = Math.max(0, savingsStart || 0);
            var monthlyRate = Math.max(0, apr) / 1200;
            var monthIndex = 0;
            var maxMonths = Math.max(360, n + 120);

            while (balance > 0.01 && monthIndex < maxMonths) {
                monthIndex += 1;

                var interestPaid = monthlyRate > 0 ? balance * monthlyRate : 0;
                var payment = Math.max(0, scheduledPayment + Math.max(0, extraPayment || 0));
                var principalPaid = payment - interestPaid;

                if (principalPaid <= 0) {
                    break;
                }

                if (principalPaid > balance) {
                    principalPaid = balance;
                    payment = principalPaid + interestPaid;
                }

                balance = Math.max(0, balance - principalPaid);
                totalInterest += interestPaid;
                totalPrincipalPaid += principalPaid;

                var monthlyObligation = (existingDebt || 0) + payment;
                var netCashflow = (income || 0) - (expenses || 0) - monthlyObligation;
                savings += netCashflow;

                rows.push({
                    month: monthIndex,
                    balance: balance,
                    principalPaid: totalPrincipalPaid,
                    interestPaid: totalInterest,
                    payment: payment,
                    dti: monthlyObligation / Math.max(1, income || 0),
                    netPosition: savings - balance,
                    savings: savings,
                    date: addMonthLabel(startMonth, monthIndex - 1)
                });
            }

            return {
                monthlyPayment: scheduledPayment,
                adjustedMonthlyPayment: scheduledPayment + Math.max(0, extraPayment || 0),
                totalRepayment: totalPrincipalPaid + totalInterest,
                totalInterest: totalInterest,
                monthsToPayoff: rows.length,
                payoffDate: rows.length ? rows[rows.length - 1].date : "-",
                rows: rows
            };
        }
    };

    var dtiEngine = {
        calculateDti: function (income, existingDebt, loanPayment) {
            return (Math.max(0, existingDebt) + Math.max(0, loanPayment)) / Math.max(1, income);
        },

        affordability: function (income, expenses, existingDebt, payment) {
            var disposable = Math.max(0, income - expenses - existingDebt);
            var coverage = payment > 0 ? disposable / payment : 0;

            if (coverage >= 2.1) {
                return { label: "Safe", key: "safe", score: 92 };
            }

            if (coverage >= 1.5) {
                return { label: "Moderate", key: "moderate", score: 73 };
            }

            if (coverage >= 1.1) {
                return { label: "Caution", key: "caution", score: 56 };
            }

            return { label: "High Risk", key: "risk", score: 35 };
        },

        dtiBand: function (ratio) {
            if (ratio <= 0.3) {
                return { label: "Safe", key: "safe" };
            }

            if (ratio <= 0.4) {
                return { label: "Moderate", key: "moderate" };
            }

            if (ratio <= 0.5) {
                return { label: "Caution", key: "caution" };
            }

            return { label: "High Risk", key: "risk" };
        }
    };

    var stressTestEngine = {
        run: function (model, payment) {
            var dti = dtiEngine.calculateDti(model.income, model.existingDebts, payment);
            var disposable = model.income - model.expenses - model.existingDebts - payment;
            var affordability = dtiEngine.affordability(model.income, model.expenses, model.existingDebts, payment);
            var level;
            var recommendation;

            if (dti > 0.5 || disposable < 0) {
                level = "High Risk";
                recommendation = "Reduce loan size or wait until monthly cash flow improves.";
            } else if (dti > 0.42 || disposable < payment * 0.35) {
                level = "Caution";
                recommendation = "Consider a lower payment strategy and build additional emergency buffer.";
            } else if (dti > 0.33 || disposable < payment * 0.8) {
                level = "Moderate";
                recommendation = "Loan appears manageable but monitor expenses and keep reserves.";
            } else {
                level = "Safe";
                recommendation = "Current budget supports repayment with reasonable flexibility.";
            }

            return {
                dti: dti,
                disposable: disposable,
                affordability: affordability,
                level: level,
                recommendation: recommendation
            };
        }
    };

    var pathExplorerEngine = {
        pathConfigs: function (model) {
            var debtBalanceTotal = model.debtRows.reduce(function (sum, debt) {
                return sum + Math.max(0, debt.balance);
            }, 0);

            return {
                standard: {
                    label: "Standard loan repayment",
                    principal: model.loanAmount,
                    apr: model.apr,
                    term: model.termMonths,
                    extra: 0,
                    income: model.income,
                    expenses: model.expenses,
                    existingDebt: model.existingDebts,
                    savings: model.savings,
                    adjustmentNote: "Base repayment path."
                },
                extra: {
                    label: "Loan + extra monthly payment",
                    principal: model.loanAmount,
                    apr: model.apr,
                    term: model.termMonths,
                    extra: model.extraPayment,
                    income: model.income,
                    expenses: model.expenses,
                    existingDebt: model.existingDebts,
                    savings: model.savings,
                    adjustmentNote: "Adds extra payment to reduce interest and payoff time."
                },
                shorter: {
                    label: "Shorter term repayment",
                    principal: model.loanAmount,
                    apr: model.apr,
                    term: Math.max(6, Math.round(model.termMonths * 0.72)),
                    extra: 0,
                    income: model.income,
                    expenses: model.expenses,
                    existingDebt: model.existingDebts,
                    savings: model.savings,
                    adjustmentNote: "Shortens term for lower total interest."
                },
                longer: {
                    label: "Longer term repayment",
                    principal: model.loanAmount,
                    apr: model.apr,
                    term: Math.min(120, Math.round(model.termMonths * 1.45)),
                    extra: 0,
                    income: model.income,
                    expenses: model.expenses,
                    existingDebt: model.existingDebts,
                    savings: model.savings,
                    adjustmentNote: "Lowers payment but extends borrowing horizon."
                },
                delay: {
                    label: "Delay borrowing and save first",
                    principal: Math.max(0, model.loanAmount - Math.max(0, (model.income - model.expenses - model.existingDebts) * 3 * 0.75)),
                    apr: model.apr,
                    term: model.termMonths,
                    extra: 0,
                    income: model.income,
                    expenses: model.expenses,
                    existingDebt: model.existingDebts,
                    savings: model.savings + Math.max(0, (model.income - model.expenses - model.existingDebts) * 3),
                    adjustmentNote: "Wait 3 months and reduce principal with savings."
                },
                consolidation: {
                    label: "Debt consolidation instead",
                    principal: model.loanAmount + debtBalanceTotal,
                    apr: Math.max(4, model.apr - 2),
                    term: Math.max(48, model.termMonths),
                    extra: 0,
                    income: model.income,
                    expenses: model.expenses,
                    existingDebt: 0,
                    savings: model.savings,
                    adjustmentNote: "Combines selected loan with existing debt balances."
                }
            };
        },

        simulate: function (model) {
            var configs = this.pathConfigs(model);
            var results = [];

            Object.keys(configs).forEach(function (key) {
                if (!model.pathSelection[key]) {
                    return;
                }

                var config = configs[key];
                var run = calculatorEngine.amortization(
                    config.principal,
                    config.apr,
                    config.term,
                    config.extra,
                    config.income,
                    config.expenses,
                    config.existingDebt,
                    config.savings,
                    model.startMonth
                );

                var dti = dtiEngine.calculateDti(config.income, config.existingDebt, run.adjustedMonthlyPayment);
                var health = recommendationEngine.healthScore(dti, run.totalInterest, config.principal, config.income - config.expenses - config.existingDebt - run.adjustedMonthlyPayment);

                results.push({
                    key: key,
                    label: config.label,
                    note: config.adjustmentNote,
                    monthlyPayment: run.adjustedMonthlyPayment,
                    totalInterest: run.totalInterest,
                    durationMonths: run.monthsToPayoff,
                    healthScore: health,
                    rows: run.rows
                });
            });

            return results;
        }
    };

    var borrowingPowerEngine = {
        run: function (model) {
            var disposable = Math.max(0, model.income - model.expenses - model.existingDebts);
            var dtiCapPayment = Math.max(0, model.income * 0.35 - model.existingDebts);
            var comfortablePayment = Math.max(0, Math.min(disposable * 0.7, dtiCapPayment));
            var maxLoan = calculatorEngine.maxPrincipalFromPayment(comfortablePayment, model.apr, model.termMonths);
            var affordability = dtiEngine.affordability(model.income, model.expenses, model.existingDebts, comfortablePayment);

            return {
                maxLoan: maxLoan,
                comfortablePayment: comfortablePayment,
                affordability: affordability.label
            };
        }
    };

    var consolidationEngine = {
        run: function (model) {
            var principalTotal = 0;
            var currentPayment = 0;
            var currentInterestEstimate = 0;

            model.debtRows.forEach(function (debt) {
                var principal = Math.max(0, debt.balance);
                var apr = Math.max(0, debt.rate);
                principalTotal += principal;
                currentPayment += Math.max(0, debt.payment);
                currentInterestEstimate += principal * (apr / 100) * 2;
            });

            var consolidationRate = Math.max(4, model.apr - 1.8);
            var consolidatedPayment = calculatorEngine.monthlyPayment(principalTotal, consolidationRate, model.termMonths);
            var consolidatedRepayment = consolidatedPayment * model.termMonths;
            var consolidatedInterest = Math.max(0, consolidatedRepayment - principalTotal);

            return {
                principalTotal: principalTotal,
                currentPayment: currentPayment,
                consolidatedPayment: consolidatedPayment,
                monthlySavings: currentPayment - consolidatedPayment,
                interestSavings: currentInterestEstimate - consolidatedInterest,
                consolidatedInterest: consolidatedInterest
            };
        }
    };

    var recommendationEngine = {
        healthScore: function (dti, totalInterest, principal, monthlyBuffer) {
            var score = 100;

            if (dti > 0.5) {
                score -= 38;
            } else if (dti > 0.42) {
                score -= 24;
            } else if (dti > 0.35) {
                score -= 14;
            }

            if (principal > 0) {
                var interestShare = totalInterest / principal;

                if (interestShare > 0.7) {
                    score -= 22;
                } else if (interestShare > 0.45) {
                    score -= 14;
                } else if (interestShare > 0.25) {
                    score -= 8;
                }
            }

            if (monthlyBuffer < 0) {
                score -= 25;
            } else if (monthlyBuffer < 300) {
                score -= 14;
            } else if (monthlyBuffer < 700) {
                score -= 7;
            }

            return clamp(Math.round(score), 0, 100);
        },

        chooseStrategy: function (strategies, model, dti) {
            var lowestInterest = strategies.reduce(function (best, strategy) {
                return strategy.totalInterest < best.totalInterest ? strategy : best;
            }, strategies[0]);

            var lowestPayment = strategies.reduce(function (best, strategy) {
                return strategy.monthlyPayment < best.monthlyPayment ? strategy : best;
            }, strategies[0]);

            if (dti > 0.4 || model.income - model.expenses - model.existingDebts < lowestPayment.monthlyPayment * 1.25) {
                return {
                    key: "lower",
                    reason: "Recommended for lowest monthly burden given current cash-flow pressure."
                };
            }

            if (lowestInterest.key === "faster" && model.extraPayment >= 0) {
                return {
                    key: "faster",
                    reason: "Recommended for lowest total interest while remaining affordable."
                };
            }

            return {
                key: "balanced",
                reason: "Recommended for balanced affordability and borrowing cost."
            };
        },

        build: function (model, core, strategies, stress, shock, borrowingPower, consolidation, paths) {
            var recommendations = [];

            if (stress.level === "High Risk" || stress.level === "Caution") {
                recommendations.push("Reduce the loan amount by about " + currency.format(Math.max(500, model.loanAmount * 0.08)) + " to improve budget flexibility.");
            }

            if (model.extraPayment < 50) {
                recommendations.push("Add at least " + currency.format(50) + " extra monthly to cut interest and shorten payoff duration.");
            } else {
                recommendations.push("Maintain your extra payment of " + currency.format(model.extraPayment) + " to accelerate principal reduction.");
            }

            if (core.monthsToPayoff > 60 && stress.level !== "High Risk") {
                recommendations.push("Choose a shorter term if your budget allows to reduce total repayment cost.");
            }

            if (consolidation.monthlySavings > 0 && consolidation.interestSavings > 0) {
                recommendations.push("Consider consolidation if current debt payments remain high; estimated monthly savings are " + currency.format(consolidation.monthlySavings) + ".");
            }

            if (shock.afterHealth + 8 < shock.beforeHealth) {
                recommendations.push("Wait and save for 3 months before borrowing to improve resilience against payment shocks.");
            }

            if (borrowingPower.maxLoan + 1 < model.loanAmount) {
                recommendations.push("Your selected amount exceeds the comfortable range. Consider targeting " + currency.format(Math.round(borrowingPower.maxLoan)) + " or less.");
            }

            if (!paths.length) {
                recommendations.push("Enable at least one financial path in the explorer to compare alternatives before applying.");
            }

            if (!recommendations.length) {
                recommendations.push("Current plan appears stable. Continue monitoring DTI and maintain your emergency buffer.");
            }

            return recommendations.slice(0, 6);
        }
    };

    var chartRenderer = {
        clear: function (ctx, canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        },

        drawLineChart: function (canvas, series, yStartAtZero) {
            if (!canvas || !canvas.getContext || !series.length) {
                return;
            }

            var palette = chartThemePalette();
            var ctx = canvas.getContext("2d");
            this.clear(ctx, canvas);

            var width = canvas.width;
            var height = canvas.height;
            var left = 52;
            var right = 18;
            var top = 18;
            var bottom = 30;

            var maxPoints = series.reduce(function (maxValue, line) {
                return Math.max(maxValue, line.values.length);
            }, 1);

            var allValues = [];
            series.forEach(function (line) {
                line.values.forEach(function (value) {
                    allValues.push(value);
                });
            });

            if (!allValues.length) {
                allValues = [0, 1];
            }

            var minValue = yStartAtZero ? 0 : Math.min.apply(null, allValues.concat([0]));
            var maxValue = Math.max.apply(null, allValues.concat([1]));

            if (maxValue === minValue) {
                maxValue += 1;
            }

            function xFor(index) {
                return left + (index / Math.max(1, maxPoints - 1)) * (width - left - right);
            }

            function yFor(value) {
                return top + (1 - ((value - minValue) / (maxValue - minValue))) * (height - top - bottom);
            }

            ctx.strokeStyle = palette.grid;
            ctx.lineWidth = 1;

            for (var i = 0; i <= 4; i += 1) {
                var y = top + (i / 4) * (height - top - bottom);
                ctx.beginPath();
                ctx.moveTo(left, y);
                ctx.lineTo(width - right, y);
                ctx.stroke();
            }

            series.forEach(function (line) {
                ctx.beginPath();
                ctx.strokeStyle = line.color;
                ctx.lineWidth = 2.2;

                line.values.forEach(function (value, index) {
                    var x = xFor(index);
                    var y = yFor(value);

                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();
            });

            ctx.fillStyle = palette.axis;
            ctx.font = "12px Manrope";
            ctx.fillText(formatCompact(minValue), 10, height - bottom + 4);
            ctx.fillText(formatCompact(maxValue), 10, top + 4);

            var legendX = left;
            series.forEach(function (line) {
                ctx.fillStyle = line.color;
                ctx.fillRect(legendX, height - 16, 10, 10);
                ctx.fillStyle = palette.legend;
                ctx.fillText(line.label, legendX + 14, height - 7);
                legendX += ctx.measureText(line.label).width + 38;
            });
        },

        drawBarChart: function (canvas, entries) {
            if (!canvas || !canvas.getContext || !entries.length) {
                return;
            }

            var palette = chartThemePalette();
            var ctx = canvas.getContext("2d");
            this.clear(ctx, canvas);

            var width = canvas.width;
            var height = canvas.height;
            var left = 50;
            var right = 20;
            var top = 20;
            var bottom = 46;
            var chartHeight = height - top - bottom;
            var chartWidth = width - left - right;
            var maxValue = entries.reduce(function (maxV, entry) {
                return Math.max(maxV, entry.value);
            }, 1);

            var barWidth = chartWidth / Math.max(1, entries.length * 1.6);

            ctx.strokeStyle = palette.grid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(left, top);
            ctx.lineTo(left, height - bottom);
            ctx.lineTo(width - right, height - bottom);
            ctx.stroke();

            entries.forEach(function (entry, index) {
                var x = left + (index + 0.5) * (chartWidth / entries.length);
                var h = (entry.value / Math.max(1, maxValue)) * chartHeight;
                var y = height - bottom - h;

                ctx.fillStyle = entry.color;
                roundRect(ctx, x - barWidth / 2, y, barWidth, h, 6, true, false);

                ctx.fillStyle = palette.legend;
                ctx.font = "11px Manrope";
                ctx.textAlign = "center";
                ctx.fillText(entry.label, x, height - bottom + 15);
                ctx.fillText(currency.format(entry.value), x, y - 6);
            });

            ctx.textAlign = "start";
        },

        drawDonut: function (canvas, values, colors, labelLines) {
            if (!canvas || !canvas.getContext || values.length !== colors.length) {
                return;
            }

            var palette = chartThemePalette();
            var ctx = canvas.getContext("2d");
            this.clear(ctx, canvas);

            var width = canvas.width;
            var height = canvas.height;
            var total = values.reduce(function (sum, value) {
                return sum + Math.max(0, value);
            }, 0) || 1;
            var cx = width / 2;
            var cy = height / 2;
            var radius = Math.min(width, height) * 0.33;
            var inner = radius * 0.58;
            var angle = -Math.PI / 2;

            values.forEach(function (value, index) {
                var segment = (Math.max(0, value) / total) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, angle, angle + segment);
                ctx.arc(cx, cy, inner, angle + segment, angle, true);
                ctx.closePath();
                ctx.fillStyle = colors[index];
                ctx.fill();
                angle += segment;
            });

            ctx.fillStyle = palette.centerPrimary;
            ctx.font = "bold 12px Manrope";
            ctx.textAlign = "center";
            ctx.fillText(labelLines[0] || "", cx, cy - 4);
            ctx.font = "11px Manrope";
            ctx.fillStyle = palette.centerSecondary;
            ctx.fillText(labelLines[1] || "", cx, cy + 14);
            ctx.textAlign = "start";
        }
    };

    function query(selector) {
        return document.querySelector(selector);
    }

    function queryAll(selector) {
        return Array.prototype.slice.call(document.querySelectorAll(selector));
    }

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function formatCompact(value) {
        var abs = Math.abs(value);

        if (abs >= 1000) {
            return currency.format(value);
        }

        return value.toFixed(0);
    }

    function addMonthLabel(startMonth, offset) {
        if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) {
            return "-";
        }

        var parts = startMonth.split("-");
        var year = Number(parts[0]);
        var month = Number(parts[1]) - 1;
        var date = new Date(year, month + offset, 1);

        return date.toLocaleDateString("en-CA", {
            month: "short",
            year: "numeric"
        });
    }

    function setText(id, value) {
        var node = document.getElementById(id);
        if (node) {
            node.textContent = value;
        }
    }

    function updateChip(node, text, key) {
        if (!node) {
            return;
        }

        node.textContent = text;
        node.className = "status-chip";

        if (key === "safe") {
            node.classList.add("is-safe");
        } else if (key === "moderate") {
            node.classList.add("is-moderate");
        } else if (key === "caution") {
            node.classList.add("is-caution");
        } else {
            node.classList.add("is-risk");
        }
    }

    function setMeter(id, value, key) {
        var node = document.getElementById(id);
        if (!node) {
            return;
        }

        node.style.width = clamp(value, 0, 100) + "%";

        if (key === "safe") {
            node.style.background = "var(--meter-safe-gradient)";
        } else if (key === "moderate") {
            node.style.background = "var(--meter-moderate-gradient)";
        } else if (key === "caution") {
            node.style.background = "var(--meter-caution-gradient)";
        } else {
            node.style.background = "var(--meter-risk-gradient)";
        }
    }

    function readThemeColor(variableName, fallback) {
        var rootStyles = window.getComputedStyle(document.documentElement);
        var value = rootStyles.getPropertyValue(variableName);
        var normalized = value ? value.trim() : "";
        return normalized || fallback;
    }

    function chartThemePalette() {
        return {
            loan: readThemeColor("--chart-loan", "#64b4ff"),
            savings: readThemeColor("--chart-savings", "#59d4a4"),
            interest: readThemeColor("--chart-interest", "#ffbf68"),
            net: readThemeColor("--chart-net", "#d99bff"),
            grid: readThemeColor("--chart-grid", "rgba(146, 177, 222, 0.28)"),
            axis: readThemeColor("--chart-axis", "#9eaec6"),
            legend: readThemeColor("--chart-legend", "#c8d4e8"),
            centerPrimary: readThemeColor("--chart-center-primary", "#d5e3f8"),
            centerSecondary: readThemeColor("--chart-center-secondary", "#a8bad5")
        };
    }

    function readFormState() {
        state.loanAmount = number(query("#loanAmount").value, state.loanAmount);
        state.apr = number(query("#apr").value, state.apr);
        state.termMonths = number(query("#termMonths").value, state.termMonths);
        state.startMonth = query("#startMonth").value;
        state.loanPurpose = query("#loanPurpose").value;
        state.extraPayment = number(query("#extraPayment").value, state.extraPayment);

        state.income = number(query("#monthlyIncome").value, state.income);
        state.expenses = number(query("#livingExpenses").value, state.expenses);
        state.existingDebts = number(query("#existingDebtPayment").value, state.existingDebts);
        state.savings = number(query("#savingsBalance").value, state.savings);

        state.shocks.rateIncrease = number(query("#shockRateIncrease").value, state.shocks.rateIncrease);
        state.shocks.incomeDrop = number(query("#shockIncomeDrop").value, state.shocks.incomeDrop);
        state.shocks.oneTimeExpense = number(query("#shockOneTimeExpense").value, state.shocks.oneTimeExpense);
        state.shocks.recurringExpense = number(query("#shockRecurringExpense").value, state.shocks.recurringExpense);

        queryAll("[data-path-toggle]").forEach(function (toggle) {
            var key = toggle.getAttribute("data-path-toggle");
            state.pathSelection[key] = Boolean(toggle.checked);
        });

        setText("loanAmountValue", currency.format(state.loanAmount));
        setText("aprValue", state.apr.toFixed(1) + "%");
        setText("termValue", Math.round(state.termMonths) + " months");
        setText("extraPaymentValue", currency.format(state.extraPayment));
    }

    function renderStrategyCards(strategies, recommended) {
        queryAll(".strategy-card").forEach(function (card) {
            var key = card.getAttribute("data-strategy");
            var data = strategies.find(function (s) {
                return s.key === key;
            });

            if (!data) {
                return;
            }

            var monthly = card.querySelector('[data-field="monthly"]');
            var interest = card.querySelector('[data-field="interest"]');
            var duration = card.querySelector('[data-field="duration"]');

            if (monthly) {
                monthly.textContent = preciseCurrency.format(data.monthlyPayment);
            }

            if (interest) {
                interest.textContent = currency.format(data.totalInterest);
            }

            if (duration) {
                duration.textContent = data.months + " months";
            }

            card.classList.toggle("is-recommended", recommended.key === key);
        });

        setText("strategyRecommendationText", recommended.reason);
    }

    function renderPathCards(paths) {
        var host = document.getElementById("pathCardGrid");
        if (!host) {
            return;
        }

        host.innerHTML = "";

        if (!paths.length) {
            host.innerHTML = '<article class="path-card"><h3>No path selected</h3><p>Select at least one path toggle to compare scenarios.</p></article>';
            return;
        }

        paths.forEach(function (path) {
            var card = document.createElement("article");
            card.className = "path-card";
            card.innerHTML =
                "<h3>" + escapeHtml(path.label) + "</h3>" +
                "<ul>" +
                "<li><span>Monthly payment</span><strong>" + preciseCurrency.format(path.monthlyPayment) + "</strong></li>" +
                "<li><span>Total interest</span><strong>" + currency.format(path.totalInterest) + "</strong></li>" +
                "<li><span>Duration</span><strong>" + path.durationMonths + " months</strong></li>" +
                "<li><span>Health score</span><strong>" + path.healthScore + " / 100</strong></li>" +
                "</ul>" +
                "<p class=\"helper-text\">" + escapeHtml(path.note) + "</p>";
            host.appendChild(card);
        });
    }

    function renderDebtRows() {
        var host = document.getElementById("debtRows");
        if (!host) {
            return;
        }

        host.innerHTML = "";

        state.debtRows.forEach(function (debt, index) {
            var row = document.createElement("div");
            row.className = "debt-row";
            row.setAttribute("data-debt-id", String(debt.id));
            row.innerHTML =
                "<label>Debt name<input type=\"text\" data-debt-field=\"name\" value=\"" + escapeHtml(debt.name) + "\"></label>" +
                "<label>Balance<input type=\"number\" min=\"0\" step=\"50\" data-debt-field=\"balance\" value=\"" + debt.balance + "\"></label>" +
                "<label>Interest rate (%)<input type=\"number\" min=\"0\" max=\"60\" step=\"0.1\" data-debt-field=\"rate\" value=\"" + debt.rate + "\"></label>" +
                "<label>Monthly payment<input type=\"number\" min=\"0\" step=\"10\" data-debt-field=\"payment\" value=\"" + debt.payment + "\"></label>" +
                (state.debtRows.length > 1 ? "<button type=\"button\" data-remove-debt=\"" + index + "\">Remove</button>" : "");
            host.appendChild(row);
        });
    }

    function readDebtRowsFromDom() {
        var rows = queryAll(".debt-row");

        rows.forEach(function (row) {
            var id = Number(row.getAttribute("data-debt-id"));
            var debt = state.debtRows.find(function (item) {
                return item.id === id;
            });

            if (!debt) {
                return;
            }

            var nameInput = row.querySelector('[data-debt-field="name"]');
            var balanceInput = row.querySelector('[data-debt-field="balance"]');
            var rateInput = row.querySelector('[data-debt-field="rate"]');
            var paymentInput = row.querySelector('[data-debt-field="payment"]');

            debt.name = nameInput ? String(nameInput.value || "Debt").trim().slice(0, 60) : debt.name;
            debt.balance = Math.max(0, number(balanceInput ? balanceInput.value : debt.balance, debt.balance));
            debt.rate = Math.max(0, number(rateInput ? rateInput.value : debt.rate, debt.rate));
            debt.payment = Math.max(0, number(paymentInput ? paymentInput.value : debt.payment, debt.payment));
        });
    }

    function renderCharts(core, paths, strategies) {
        var palette = chartThemePalette();
        var balanceSeries = [
            {
                label: "Remaining balance",
                color: palette.loan,
                values: core.rows.map(function (row) {
                    return row.balance;
                })
            },
            {
                label: "Principal paid",
                color: palette.savings,
                values: core.rows.map(function (row) {
                    return row.principalPaid;
                })
            },
            {
                label: "Interest paid",
                color: palette.interest,
                values: core.rows.map(function (row) {
                    return row.interestPaid;
                })
            }
        ];

        var bestPath = paths.length ? paths.reduce(function (best, path) {
            return path.healthScore > best.healthScore ? path : best;
        }, paths[0]) : null;

        var netSeries = [];

        if (core.rows.length) {
            netSeries.push({
                label: "Loan balance",
                color: palette.loan,
                values: core.rows.map(function (row) {
                    return row.balance;
                })
            });

            netSeries.push({
                label: "Savings balance",
                color: palette.savings,
                values: core.rows.map(function (row) {
                    return row.savings;
                })
            });

            netSeries.push({
                label: "Net position",
                color: palette.interest,
                values: core.rows.map(function (row) {
                    return row.netPosition;
                })
            });
        }

        if (bestPath && bestPath.rows.length) {
            netSeries.push({
                label: "Best path net",
                color: palette.net,
                values: bestPath.rows.map(function (row) {
                    return row.netPosition;
                })
            });
        }

        chartRenderer.drawLineChart(document.getElementById("balanceChart"), balanceSeries, true);
        chartRenderer.drawLineChart(document.getElementById("netPositionChart"), netSeries, false);

        chartRenderer.drawBarChart(document.getElementById("strategyChart"), [
            { label: "Balanced", value: strategies.find(function (s) { return s.key === "balanced"; }).totalInterest, color: palette.loan },
            { label: "Lower", value: strategies.find(function (s) { return s.key === "lower"; }).totalInterest, color: palette.savings },
            { label: "Faster", value: strategies.find(function (s) { return s.key === "faster"; }).totalInterest, color: palette.interest },
            {
                label: "Extra path",
                value: paths.find(function (p) {
                    return p.key === "extra";
                }) ? paths.find(function (p) {
                    return p.key === "extra";
                }).totalInterest : strategies.find(function (s) { return s.key === "balanced"; }).totalInterest,
                color: palette.net
            }
        ]);

        var principalPortion = core.totalRepayment > 0 ? state.loanAmount / core.totalRepayment : 0;

        chartRenderer.drawDonut(
            document.getElementById("breakdownChart"),
            [state.loanAmount, core.totalInterest],
            [palette.loan, palette.interest],
            [Math.round(principalPortion * 100) + "% principal", Math.round((1 - principalPortion) * 100) + "% interest"]
        );

        var snapshotSeries = [
            {
                label: "Loan balance",
                color: palette.loan,
                values: core.rows.map(function (row) {
                    return row.balance;
                })
            }
        ];

        chartRenderer.drawLineChart(document.getElementById("snapshotTrendChart"), snapshotSeries, true);
        chartRenderer.drawLineChart(document.getElementById("mobileSnapshotTrendChart"), snapshotSeries, true);
    }

    function runDashboard() {
        readFormState();
        readDebtRowsFromDom();

        var core = calculatorEngine.amortization(
            state.loanAmount,
            state.apr,
            state.termMonths,
            state.extraPayment,
            state.income,
            state.expenses,
            state.existingDebts,
            state.savings,
            state.startMonth
        );

        var dti = dtiEngine.calculateDti(state.income, state.existingDebts, core.adjustedMonthlyPayment);
        var dtiBand = dtiEngine.dtiBand(dti);
        var affordability = dtiEngine.affordability(state.income, state.expenses, state.existingDebts, core.adjustedMonthlyPayment);
        var stress = stressTestEngine.run(state, core.adjustedMonthlyPayment);

        var healthScore = recommendationEngine.healthScore(
            dti,
            core.totalInterest,
            state.loanAmount,
            state.income - state.expenses - state.existingDebts - core.adjustedMonthlyPayment
        );

        var strategies = buildStrategies();
        var recommendedStrategy = recommendationEngine.chooseStrategy(strategies, state, dti);
        state.strategySelection = recommendedStrategy.key;

        var beforeShock = {
            monthlyPayment: core.adjustedMonthlyPayment,
            dti: dti,
            health: healthScore
        };

        var shockRun = calculatorEngine.amortization(
            state.loanAmount,
            state.apr + state.shocks.rateIncrease,
            state.termMonths,
            state.extraPayment,
            Math.max(0, state.income - state.shocks.incomeDrop),
            state.expenses + state.shocks.recurringExpense,
            state.existingDebts,
            Math.max(0, state.savings - state.shocks.oneTimeExpense),
            state.startMonth
        );

        var shockDti = dtiEngine.calculateDti(
            Math.max(1, state.income - state.shocks.incomeDrop),
            state.existingDebts,
            shockRun.adjustedMonthlyPayment
        );

        var shockHealth = recommendationEngine.healthScore(
            shockDti,
            shockRun.totalInterest,
            state.loanAmount,
            Math.max(0, state.income - state.shocks.incomeDrop) - (state.expenses + state.shocks.recurringExpense) - state.existingDebts - shockRun.adjustedMonthlyPayment
        );

        var shockSummary = buildShockSummary(beforeShock, {
            monthlyPayment: shockRun.adjustedMonthlyPayment,
            dti: shockDti,
            health: shockHealth
        });

        var paths = pathExplorerEngine.simulate(state);
        var borrowingPower = borrowingPowerEngine.run(state);
        var consolidation = consolidationEngine.run(state);

        var recommendationList = recommendationEngine.build(
            state,
            core,
            strategies,
            stress,
            {
                beforeHealth: beforeShock.health,
                afterHealth: shockHealth
            },
            borrowingPower,
            consolidation,
            paths
        );

        renderPrimary(core);
        renderSnapshot(core, dti, healthScore, affordability, stress.level);
        renderStrategyCards(strategies, recommendedStrategy);
        renderHealthSection(dti, dtiBand, affordability, healthScore, borrowingPower.maxLoan);
        renderStressSection(stress);
        renderShockSection(beforeShock, {
            monthlyPayment: shockRun.adjustedMonthlyPayment,
            dti: shockDti,
            health: shockHealth
        }, shockSummary);
        renderPathCards(paths);
        renderBorrowingPower(borrowingPower);
        renderConsolidation(consolidation);
        renderRecommendations(recommendationList);
        renderCharts(core, paths, strategies);

        latestResults = {
            core: core,
            dti: dti,
            health: healthScore,
            affordability: affordability.label,
            stress: stress.level,
            recommendations: recommendationList,
            strategy: recommendedStrategy.key
        };
    }

    function buildStrategies() {
        var balanced = calculatorEngine.amortization(
            state.loanAmount,
            state.apr,
            state.termMonths,
            0,
            state.income,
            state.expenses,
            state.existingDebts,
            state.savings,
            state.startMonth
        );

        var lower = calculatorEngine.amortization(
            state.loanAmount,
            state.apr,
            Math.min(120, Math.round(state.termMonths * 1.35)),
            0,
            state.income,
            state.expenses,
            state.existingDebts,
            state.savings,
            state.startMonth
        );

        var faster = calculatorEngine.amortization(
            state.loanAmount,
            state.apr,
            Math.max(6, Math.round(state.termMonths * 0.72)),
            state.extraPayment,
            state.income,
            state.expenses,
            state.existingDebts,
            state.savings,
            state.startMonth
        );

        return [
            {
                key: "balanced",
                monthlyPayment: balanced.adjustedMonthlyPayment,
                totalInterest: balanced.totalInterest,
                months: balanced.monthsToPayoff
            },
            {
                key: "lower",
                monthlyPayment: lower.adjustedMonthlyPayment,
                totalInterest: lower.totalInterest,
                months: lower.monthsToPayoff
            },
            {
                key: "faster",
                monthlyPayment: faster.adjustedMonthlyPayment,
                totalInterest: faster.totalInterest,
                months: faster.monthsToPayoff
            }
        ];
    }

    function renderPrimary(core) {
        var principalPortion = core.totalRepayment > 0 ? (state.loanAmount / core.totalRepayment) : 0;
        var interestPortion = core.totalRepayment > 0 ? (core.totalInterest / core.totalRepayment) : 0;

        setText("primaryMonthlyPayment", preciseCurrency.format(core.adjustedMonthlyPayment));
        setText("primaryTotalRepayment", preciseCurrency.format(core.totalRepayment));
        setText("primaryTotalInterest", preciseCurrency.format(core.totalInterest));
        setText("primaryPayoffDate", core.payoffDate);
        setText("principalPortion", Math.round(principalPortion * 100) + "%");
        setText("interestPortion", Math.round(interestPortion * 100) + "%");
    }

    function renderSnapshot(core, dti, healthScore, affordability, stressLevel) {
        setText("snapshotMonthlyPayment", preciseCurrency.format(core.adjustedMonthlyPayment));
        setText("snapshotTotalRepayment", preciseCurrency.format(core.totalRepayment));
        setText("snapshotTotalInterest", preciseCurrency.format(core.totalInterest));
        setText("snapshotPayoffDate", core.payoffDate);
        setText("snapshotDti", percent.format(dti));
        setText("snapshotHealth", String(healthScore));
        setText("snapshotAffordability", affordability.label);
        setText("snapshotStress", stressLevel);

        setText("mobileSnapshotMonthlyPayment", preciseCurrency.format(core.adjustedMonthlyPayment) + "/mo");
        setText("mobileSnapshotHealth", String(healthScore));
        setText("mobileMonthlyPayment", preciseCurrency.format(core.adjustedMonthlyPayment));
        setText("mobileTotalRepayment", preciseCurrency.format(core.totalRepayment));
        setText("mobileTotalInterest", preciseCurrency.format(core.totalInterest));
        setText("mobilePayoffDate", core.payoffDate);
        setText("mobileDti", percent.format(dti));
        setText("mobileHealth", String(healthScore));
        setText("mobileStress", stressLevel);
    }

    function renderHealthSection(dti, dtiBand, affordability, healthScore, maxLoan) {
        setText("healthDtiValue", percent.format(dti));
        setText("affordabilityValue", affordability.label);
        setText("recommendedRange", currency.format(Math.max(500, Math.round(maxLoan * 0.75))) + " to " + currency.format(Math.round(maxLoan)));
        setText("healthScore", String(healthScore));

        setMeter("dtiMeterBar", clamp((dti / 0.55) * 100, 0, 100), dtiBand.key);
        setMeter("affordabilityMeterBar", affordability.score, affordability.key);

        var healthKey = healthScore >= 80 ? "safe" : (healthScore >= 65 ? "moderate" : (healthScore >= 50 ? "caution" : "risk"));
        setMeter("healthMeterBar", healthScore, healthKey);

        updateChip(document.getElementById("dtiChip"), dtiBand.label, dtiBand.key);
        updateChip(document.getElementById("affordabilityChip"), affordability.label, affordability.key);
        updateChip(document.getElementById("rangeChip"), maxLoan >= state.loanAmount ? "Safe" : "Caution", maxLoan >= state.loanAmount ? "safe" : "caution");
        updateChip(document.getElementById("healthChip"), healthKey === "risk" ? "High Risk" : (healthKey === "caution" ? "Caution" : (healthKey === "moderate" ? "Moderate" : "Safe")), healthKey);
    }

    function renderStressSection(stress) {
        setText("stressDti", percent.format(stress.dti));
        setText("stressLevel", stress.level);
        setText("stressRecommendation", stress.recommendation);
    }

    function renderShockSection(before, after, summary) {
        setText("beforeMonthly", preciseCurrency.format(before.monthlyPayment));
        setText("beforeDti", percent.format(before.dti));
        setText("beforeHealth", String(before.health));

        setText("afterMonthly", preciseCurrency.format(after.monthlyPayment));
        setText("afterDti", percent.format(after.dti));
        setText("afterHealth", String(after.health));

        setText("shockRiskSummary", summary);
    }

    function renderBorrowingPower(result) {
        setText("borrowingMax", currency.format(Math.round(result.maxLoan)));
        setText("borrowingComfortable", preciseCurrency.format(result.comfortablePayment));
        setText("borrowingClass", result.affordability);
    }

    function renderConsolidation(result) {
        setText("consolidationCurrentPayment", preciseCurrency.format(result.currentPayment));
        setText("consolidationEstimatedPayment", preciseCurrency.format(result.consolidatedPayment));
        setText("consolidationMonthlySavings", preciseCurrency.format(result.monthlySavings));
        setText("consolidationInterestSavings", currency.format(result.interestSavings));
    }

    function renderRecommendations(items) {
        var list = document.getElementById("recommendationList");
        if (!list) {
            return;
        }

        list.innerHTML = "";

        items.forEach(function (item) {
            var li = document.createElement("li");
            li.textContent = item;
            list.appendChild(li);
        });
    }

    function buildShockSummary(before, after) {
        var dtiDelta = after.dti - before.dti;
        var paymentDelta = after.monthlyPayment - before.monthlyPayment;
        var healthDelta = after.health - before.health;

        if (dtiDelta > 0.06 || paymentDelta > 120 || healthDelta < -15) {
            return "High-impact scenario detected. Payment pressure rises sharply; prioritize lower debt load or additional savings before applying.";
        }

        if (dtiDelta > 0.03 || paymentDelta > 60 || healthDelta < -8) {
            return "Moderate shock impact. Budget remains viable but with tighter monthly flexibility and higher repayment risk.";
        }

        return "Low-to-moderate shock impact. Current plan shows resilience if expenses stay controlled and savings are maintained.";
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        var r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
        if (fill) {
            ctx.fill();
        }
        if (stroke) {
            ctx.stroke();
        }
    }

    function bindEvents() {
        queryAll("input, select").forEach(function (input) {
            input.addEventListener("input", runDashboard);
            input.addEventListener("change", runDashboard);
        });

        var debtRowsHost = document.getElementById("debtRows");
        if (debtRowsHost) {
            debtRowsHost.addEventListener("input", runDashboard);
            debtRowsHost.addEventListener("click", function (event) {
                var removeButton = event.target.closest("[data-remove-debt]");
                if (!removeButton) {
                    return;
                }

                var index = Number(removeButton.getAttribute("data-remove-debt"));
                if (Number.isInteger(index) && index >= 0 && index < state.debtRows.length) {
                    state.debtRows.splice(index, 1);
                    renderDebtRows();
                    runDashboard();
                }
            });
        }

        var addDebtRow = document.getElementById("addDebtRow");
        if (addDebtRow) {
            addDebtRow.addEventListener("click", function () {
                debtRowCounter += 1;
                state.debtRows.push({
                    id: debtRowCounter,
                    name: "Debt " + debtRowCounter,
                    balance: 1000,
                    rate: 12,
                    payment: 60
                });
                renderDebtRows();
                runDashboard();
            });
        }

        var saveBtn = document.getElementById("saveResultsBtn");
        if (saveBtn) {
            saveBtn.addEventListener("click", function () {
                if (!latestResults) {
                    return;
                }

                localStorage.setItem("trustedCashFinancialDashboard", JSON.stringify({
                    savedAt: new Date().toISOString(),
                    state: state,
                    results: latestResults
                }));

                setText("saveMessage", "Results saved on this device for future review.");
            });
        }

        var recalcBtn = document.getElementById("recalculateBtn");
        if (recalcBtn) {
            recalcBtn.addEventListener("click", function () {
                state = JSON.parse(JSON.stringify(defaultState));
                applyStateToInputs();
                renderDebtRows();
                runDashboard();
                setText("saveMessage", "Plan reset to default values and recalculated.");
            });
        }

        var mobileSnapshotToggle = document.getElementById("mobileSnapshotToggle");
        var mobileSnapshotDetails = document.getElementById("mobileSnapshotDetails");
        if (mobileSnapshotToggle && mobileSnapshotDetails) {
            mobileSnapshotToggle.addEventListener("click", function () {
                var expanded = mobileSnapshotToggle.getAttribute("aria-expanded") === "true";
                mobileSnapshotToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
                mobileSnapshotDetails.hidden = expanded;
            });
        }

        window.addEventListener("resize", debounce(runDashboard, 120));
    }

    function bindThemeObserver() {
        if (!("MutationObserver" in window)) {
            return;
        }

        var redraw = debounce(function () {
            if (document.getElementById("primaryCalcForm")) {
                runDashboard();
            }
        }, 40);

        var observer = new MutationObserver(function (mutations) {
            var changed = mutations.some(function (mutation) {
                return mutation.type === "attributes" && mutation.attributeName === "data-theme";
            });

            if (changed) {
                redraw();
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"]
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ["data-theme"]
            });
        }
    }

    function applyStateToInputs() {
        query("#loanAmount").value = String(state.loanAmount);
        query("#apr").value = String(state.apr);
        query("#termMonths").value = String(state.termMonths);
        query("#startMonth").value = state.startMonth;
        query("#loanPurpose").value = state.loanPurpose;
        query("#extraPayment").value = String(state.extraPayment);

        query("#monthlyIncome").value = String(state.income);
        query("#livingExpenses").value = String(state.expenses);
        query("#existingDebtPayment").value = String(state.existingDebts);
        query("#savingsBalance").value = String(state.savings);

        query("#shockRateIncrease").value = String(state.shocks.rateIncrease);
        query("#shockIncomeDrop").value = String(state.shocks.incomeDrop);
        query("#shockOneTimeExpense").value = String(state.shocks.oneTimeExpense);
        query("#shockRecurringExpense").value = String(state.shocks.recurringExpense);

        queryAll("[data-path-toggle]").forEach(function (toggle) {
            var key = toggle.getAttribute("data-path-toggle");
            toggle.checked = Boolean(state.pathSelection[key]);
        });
    }

    function debounce(fn, wait) {
        var timer;

        return function () {
            var args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () {
                fn.apply(null, args);
            }, wait);
        };
    }

    function init() {
        var startInput = query("#startMonth");
        if (!startInput) {
            return;
        }

        var now = new Date();
        var month = String(now.getMonth() + 1).padStart(2, "0");
        state.startMonth = now.getFullYear() + "-" + month;

        applyStateToInputs();
        renderDebtRows();

        defaultState = JSON.parse(JSON.stringify(state));

        bindEvents();
        bindThemeObserver();
        runDashboard();
    }

    document.addEventListener("DOMContentLoaded", init);
}());
