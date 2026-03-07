(function () {
    "use strict";

    var editorState = {
        mode: "content",
        pendingContent: {},
        pendingStyle: {},
        panel: null,
        status: null,
        styleType: null,
        colorInput: null,
        isAuthenticated: false
    };

    function currentPageKey() {
        return window.location.pathname;
    }

    function apiRequest(url, options) {
        return fetch(url, Object.assign({ credentials: "same-origin" }, options || {})).then(function (response) {
            return response
                .json()
                .catch(function () {
                    return {};
                })
                .then(function (data) {
                    if (!response.ok) {
                        throw new Error(data.error || "Request failed");
                    }
                    return data;
                });
        });
    }

    function checkEditorSession() {
        return apiRequest("/api/editor/session")
            .then(function (data) {
                editorState.isAuthenticated = Boolean(data.authenticated);
                return editorState.isAuthenticated;
            })
            .catch(function () {
                editorState.isAuthenticated = false;
                return false;
            });
    }

    function showEditorStatus(message, isError) {
        if (!editorState.status) {
            return;
        }

        editorState.status.textContent = message;
        editorState.status.classList.toggle("is-error", Boolean(isError));
    }

    function getSelectorForElement(element) {
        if (!element || element === document.body || element === document.documentElement) {
            return "body";
        }

        if (element.id) {
            return "#" + element.id;
        }

        var parts = [];
        var current = element;

        while (current && current !== document.body) {
            var tag = current.tagName.toLowerCase();
            var parent = current.parentElement;
            var index = 1;

            if (parent) {
                var sibling = current;
                while ((sibling = sibling.previousElementSibling)) {
                    if (sibling.tagName === current.tagName) {
                        index += 1;
                    }
                }
            }

            parts.unshift(tag + ":nth-of-type(" + index + ")");
            current = parent;
        }

        return "body > " + parts.join(" > ");
    }

    function applyEditorEditsForPage() {
        return apiRequest("/api/editor/edits?page=" + encodeURIComponent(currentPageKey()))
            .then(function (data) {
                var pageContent = data.content || {};
                var pageStyle = data.style || {};

                Object.keys(pageContent).forEach(function (selector) {
                    var element = document.querySelector(selector);
                    if (element) {
                        element.textContent = pageContent[selector];
                    }
                });

                Object.keys(pageStyle).forEach(function (selector) {
                    var element = document.querySelector(selector);
                    var styleObj = pageStyle[selector];

                    if (!element || !styleObj) {
                        return;
                    }

                    Object.keys(styleObj).forEach(function (property) {
                        element.style[property] = styleObj[property];
                    });
                });
            })
            .catch(function () {
                return null;
            });
    }

    function saveEditorChanges() {
        var hasChanges = Object.keys(editorState.pendingContent).length > 0 || Object.keys(editorState.pendingStyle).length > 0;

        if (!hasChanges) {
            showEditorStatus("No pending edits to save.", false);
            return;
        }

        apiRequest("/api/editor/edits", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                page: currentPageKey(),
                content: editorState.pendingContent,
                style: editorState.pendingStyle
            })
        })
            .then(function () {
                editorState.pendingContent = {};
                editorState.pendingStyle = {};
                showEditorStatus("Edits saved to server for this page.", false);
            })
            .catch(function (error) {
                showEditorStatus(error.message || "Failed to save edits.", true);
            });
    }

    function setEditorMode(mode) {
        editorState.mode = mode;

        if (!editorState.panel) {
            return;
        }

        var contentBtn = editorState.panel.querySelector('[data-editor-mode="content"]');
        var styleBtn = editorState.panel.querySelector('[data-editor-mode="style"]');
        var styleControls = editorState.panel.querySelector(".site-editor-style-controls");

        if (contentBtn && styleBtn) {
            contentBtn.classList.toggle("active", mode === "content");
            styleBtn.classList.toggle("active", mode === "style");
        }

        if (styleControls) {
            styleControls.classList.toggle("hidden", mode !== "style");
        }

        showEditorStatus(
            mode === "content"
                ? "Content mode active. Double-click text to edit."
                : "Style mode active. Pick a color and double-click an element.",
            false
        );
    }

    function initEditorPanel() {
        if (!editorState.isAuthenticated) {
            return;
        }

        var panel = document.createElement("aside");
        panel.className = "site-editor-panel";
        panel.innerHTML =
            '<h3>Editor Mode</h3>' +
            '<p class="site-editor-help">Double-click page elements to edit.</p>' +
            '<div class="site-editor-modes">' +
            '  <button type="button" class="site-editor-btn active" data-editor-mode="content">Content</button>' +
            '  <button type="button" class="site-editor-btn" data-editor-mode="style">Style</button>' +
            '</div>' +
            '<div class="site-editor-style-controls hidden">' +
            '  <label for="siteEditorStyleType">Color Type</label>' +
            '  <select id="siteEditorStyleType">' +
            '    <option value="color">Text Color</option>' +
            '    <option value="backgroundColor">Background Color</option>' +
            '    <option value="borderColor">Border Color</option>' +
            '  </select>' +
            '  <input id="siteEditorColor" type="color" value="#2e8cff" aria-label="Pick a color">' +
            '</div>' +
            '<div class="site-editor-actions">' +
            '  <button type="button" class="site-editor-btn primary" id="siteEditorSave">Save Edits</button>' +
            '  <button type="button" class="site-editor-btn" id="siteEditorLogout">Log Out</button>' +
            '</div>' +
            '<p class="site-editor-status" id="siteEditorStatus">Content mode active. Double-click text to edit.</p>';

        document.body.appendChild(panel);

        editorState.panel = panel;
        editorState.status = panel.querySelector("#siteEditorStatus");
        editorState.styleType = panel.querySelector("#siteEditorStyleType");
        editorState.colorInput = panel.querySelector("#siteEditorColor");

        panel.addEventListener("click", function (event) {
            var modeButton = event.target.closest("[data-editor-mode]");
            if (modeButton) {
                setEditorMode(modeButton.getAttribute("data-editor-mode"));
                return;
            }

            if (event.target.id === "siteEditorSave") {
                saveEditorChanges();
                return;
            }

            if (event.target.id === "siteEditorLogout") {
                apiRequest("/api/editor/logout", { method: "POST" })
                    .catch(function () {
                        return null;
                    })
                    .then(function () {
                        window.location.href = "/editor/";
                    });
            }
        });

        setEditorMode("content");

        document.addEventListener(
            "dblclick",
            function (event) {
                if (!editorState.panel || editorState.panel.contains(event.target)) {
                    return;
                }

                if (editorState.mode === "content") {
                    handleContentDoubleClick(event);
                } else {
                    handleStyleDoubleClick(event);
                }
            },
            true
        );
    }

    function handleContentDoubleClick(event) {
        var editable = event.target.closest(
            "h1, h2, h3, h4, h5, h6, p, a, li, button, label, span, small, strong"
        );

        if (!editable || editable.closest("script") || editable.closest("style")) {
            return;
        }

        event.preventDefault();

        if (editable.isContentEditable) {
            return;
        }

        editable.setAttribute("contenteditable", "true");
        editable.classList.add("is-editor-active");
        editable.focus();

        var range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        var selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        editable.addEventListener(
            "blur",
            function () {
                var selector = getSelectorForElement(editable);
                editorState.pendingContent[selector] = editable.textContent;
                editable.removeAttribute("contenteditable");
                editable.classList.remove("is-editor-active");
                showEditorStatus("Content updated. Click Save Edits to publish.", false);
            },
            { once: true }
        );
    }

    function handleStyleDoubleClick(event) {
        var target = event.target;

        if (!target || target === document.body || target === document.documentElement) {
            return;
        }

        event.preventDefault();

        var property = editorState.styleType ? editorState.styleType.value : "color";
        var color = editorState.colorInput ? editorState.colorInput.value : "#2e8cff";
        var selector = getSelectorForElement(target);

        target.style[property] = color;

        if (!editorState.pendingStyle[selector]) {
            editorState.pendingStyle[selector] = {};
        }

        editorState.pendingStyle[selector][property] = color;
        showEditorStatus("Style updated. Click Save Edits to publish.", false);
    }

    function initEditorLoginPage() {
        var form = document.getElementById("editorLoginForm");
        var usernameInput = document.getElementById("editorUsername");
        var passwordInput = document.getElementById("editorPassword");
        var message = document.getElementById("editorLoginMessage");

        if (!form || !usernameInput || !passwordInput || !message) {
            return;
        }

        checkEditorSession().then(function (authenticated) {
            if (authenticated) {
                message.textContent = "Already logged in. Redirecting...";
                message.style.color = "#2e8cff";
                window.setTimeout(function () {
                    window.location.href = "/";
                }, 400);
            }
        });

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            apiRequest("/api/editor/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: usernameInput.value.trim(),
                    password: passwordInput.value
                })
            })
                .then(function () {
                    message.textContent = "Login successful. Redirecting...";
                    message.style.color = "#2e8cff";
                    window.setTimeout(function () {
                        window.location.href = "/";
                    }, 300);
                })
                .catch(function () {
                    message.textContent = "Invalid login credentials.";
                    message.style.color = "#ff6b6b";
                });
        });
    }

    function initThemeMode(body) {
        var THEME_STORAGE_KEY = "trusted-cash-loans-theme";
        var docEl = document.documentElement;
        var nav = document.querySelector(".nav");
        var toggle = nav ? nav.querySelector("#themeToggle") : null;

        function normalizeTheme(theme) {
            return theme === "light" || theme === "dark" ? theme : null;
        }

        function safeGetStoredTheme() {
            try {
                return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
            } catch (error) {
                return null;
            }
        }

        function safeStoreTheme(theme) {
            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, theme);
            } catch (error) {
                return null;
            }

            return null;
        }

        function getSystemTheme() {
            if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
                return "light";
            }

            return "dark";
        }

        function setTheme(theme) {
            var appliedTheme = normalizeTheme(theme) || "dark";

            docEl.setAttribute("data-theme", appliedTheme);
            body.setAttribute("data-theme", appliedTheme);

            if (toggle) {
                var nextTheme = appliedTheme === "dark" ? "light" : "dark";
                toggle.textContent = nextTheme === "dark" ? "Dark mode" : "Light mode";
                toggle.setAttribute("aria-label", "Switch to " + nextTheme + " mode");
                toggle.setAttribute("data-next-theme", nextTheme);
            }

            window.dispatchEvent(new Event("themechange"));
        }

        if (!toggle && nav) {
            toggle = document.createElement("button");
            toggle.id = "themeToggle";
            toggle.type = "button";
            toggle.className = "theme-toggle";

            var mobileToggle = nav.querySelector(".mobile-toggle");
            if (mobileToggle) {
                nav.insertBefore(toggle, mobileToggle);
            } else {
                nav.appendChild(toggle);
            }
        }

        var storedTheme = safeGetStoredTheme();
        setTheme(storedTheme || getSystemTheme());

        if (!toggle) {
            return;
        }

        toggle.addEventListener("click", function () {
            var nextTheme = toggle.getAttribute("data-next-theme");
            if (!nextTheme) {
                nextTheme = "dark";
            }

            setTheme(nextTheme);
            safeStoreTheme(nextTheme);
        });
    }

    function initMotion() {
        var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var revealTargets = document.querySelectorAll(
            "main section, .card, .post-card, .benefit-card, .metric, .form-section .container, .content .container, .success-box, .success"
        );

        revealTargets.forEach(function (target, index) {
            target.classList.add("reveal-on-scroll");
            target.style.setProperty("--reveal-delay", String((index % 7) * 45) + "ms");
        });

        if (prefersReducedMotion) {
            revealTargets.forEach(function (target) {
                target.classList.add("is-visible");
            });
            return;
        }

        if (!("IntersectionObserver" in window)) {
            revealTargets.forEach(function (target) {
                target.classList.add("is-visible");
            });
            return;
        }

        var observer = new IntersectionObserver(
            function (entries, obs) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        obs.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -8% 0px"
            }
        );

        revealTargets.forEach(function (target) {
            observer.observe(target);
        });
    }

    function initHomePage() {
        var amountRange = document.getElementById("loanAmountRange");
        var aprRange = document.getElementById("aprRange");
        var termRange = document.getElementById("termRange");
        var amountValue = document.getElementById("loanAmountValue");
        var aprValue = document.getElementById("aprValue");
        var termValue = document.getElementById("termValue");
        var monthlyOutput = document.getElementById("monthlyPayment");
        var repaymentOutput = document.getElementById("totalRepayment");
        var interestOutput = document.getElementById("totalInterest");
        var payoffOutput = document.getElementById("payoffDate");
        var mobileMonthlyOutput = document.getElementById("mobileMonthlyPayment");
        var mobileRepaymentOutput = document.getElementById("mobileTotalRepayment");
        var mobileInterestOutput = document.getElementById("mobileTotalInterest");
        var mobilePayoffOutput = document.getElementById("mobilePayoffDate");
        var principalLabel = document.getElementById("principalPortionLabel");
        var interestLabel = document.getElementById("interestPortionLabel");
        var principalBar = document.getElementById("principalPortionBar");
        var interestBar = document.getElementById("interestPortionBar");
        var paymentMixCanvas = document.getElementById("paymentMixChart");
        var payoffCanvas = document.getElementById("payoffChart");
        var examplePaymentsBody = document.getElementById("examplePaymentsBody");
        var scenarioBalancedMonthly = document.getElementById("scenarioBalancedMonthly");
        var scenarioBalancedInterest = document.getElementById("scenarioBalancedInterest");
        var scenarioBalancedDuration = document.getElementById("scenarioBalancedDuration");
        var scenarioLowerMonthly = document.getElementById("scenarioLowerMonthly");
        var scenarioLowerInterest = document.getElementById("scenarioLowerInterest");
        var scenarioLowerDuration = document.getElementById("scenarioLowerDuration");
        var scenarioFasterMonthly = document.getElementById("scenarioFasterMonthly");
        var scenarioFasterInterest = document.getElementById("scenarioFasterInterest");
        var scenarioFasterDuration = document.getElementById("scenarioFasterDuration");
        var chartAnimationToken = 0;

        function isLightTheme() {
            return document.documentElement.getAttribute("data-theme") === "light" ||
                document.body.getAttribute("data-theme") === "light";
        }

        if (
            !amountRange ||
            !aprRange ||
            !termRange ||
            !amountValue ||
            !aprValue ||
            !termValue ||
            !monthlyOutput ||
            !repaymentOutput ||
            !interestOutput ||
            !payoffOutput ||
            !principalLabel ||
            !interestLabel ||
            !principalBar ||
            !interestBar ||
            !paymentMixCanvas ||
            !payoffCanvas ||
            !examplePaymentsBody ||
            !scenarioBalancedMonthly ||
            !scenarioBalancedInterest ||
            !scenarioBalancedDuration ||
            !scenarioLowerMonthly ||
            !scenarioLowerInterest ||
            !scenarioLowerDuration ||
            !scenarioFasterMonthly ||
            !scenarioFasterInterest ||
            !scenarioFasterDuration
        ) {
            return;
        }

        function formatCurrency(value) {
            return new Intl.NumberFormat("en-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 2
            }).format(value);
        }

        function formatPercent(value) {
            return String(Math.round(value * 10) / 10) + "%";
        }

        function formatPayoffDate(months) {
            var now = new Date();
            var payoff = new Date(now.getFullYear(), now.getMonth() + months, 1);
            return payoff.toLocaleString("en-CA", { month: "long", year: "numeric" });
        }

        function calculateMonthlyPayment(principal, apr, months) {
            var monthlyRate = apr / 100 / 12;

            if (monthlyRate === 0) {
                return principal / months;
            }

            var factor = Math.pow(1 + monthlyRate, months);
            return principal * ((monthlyRate * factor) / (factor - 1));
        }

        function buildSchedule(principal, apr, months, monthlyPayment) {
            var schedule = [];
            var monthlyRate = apr / 100 / 12;
            var balance = principal;
            var cumulativePrincipal = 0;
            var cumulativeInterest = 0;
            var month;

            for (month = 1; month <= months; month += 1) {
                var interestPaid = monthlyRate === 0 ? 0 : balance * monthlyRate;
                var principalPaid = monthlyPayment - interestPaid;

                if (principalPaid > balance) {
                    principalPaid = balance;
                }

                balance = Math.max(0, balance - principalPaid);
                cumulativePrincipal += principalPaid;
                cumulativeInterest += interestPaid;

                schedule.push({
                    month: month,
                    balance: balance,
                    principalPaid: cumulativePrincipal,
                    interestPaid: cumulativeInterest
                });
            }

            return schedule;
        }

        function drawPaymentMixChart(principal, interest) {
            var ctx = paymentMixCanvas.getContext("2d");
            var width = paymentMixCanvas.width;
            var height = paymentMixCanvas.height;
            var centerX = width / 2;
            var centerY = height / 2;
            var radius = Math.min(width, height) * 0.4;
            var innerRadius = radius * 0.62;
            var total = Math.max(1, principal + interest);
            var principalAngle = (Math.PI * 2 * principal) / total;
            var ringBase = isLightTheme() ? "rgba(46,140,255,0.14)" : "rgba(46,140,255,0.2)";
            var innerColor = isLightTheme() ? "rgba(247,251,255,0.98)" : "rgba(14,21,31,0.98)";

            ctx.clearRect(0, 0, width, height);

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.fillStyle = ringBase;
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.fillStyle = "#2e8cff";
            ctx.arc(centerX, centerY, radius, -Math.PI / 2, principalAngle - Math.PI / 2);
            ctx.lineTo(centerX, centerY);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.fillStyle = "#f59e0b";
            ctx.arc(centerX, centerY, radius, principalAngle - Math.PI / 2, Math.PI * 1.5);
            ctx.lineTo(centerX, centerY);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = innerColor;
            ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawPayoffChart(schedule, principal, totalInterest, progress) {
            var ctx = payoffCanvas.getContext("2d");
            var width = payoffCanvas.width;
            var height = payoffCanvas.height;
            var leftPad = 48;
            var rightPad = 22;
            var topPad = 18;
            var bottomPad = 32;
            var xSpan = width - leftPad - rightPad;
            var ySpan = height - topPad - bottomPad;
            var maxY = Math.max(principal, totalInterest, 1);
            var pointsToRender = Math.max(2, Math.round(schedule.length * progress));
            var chartBackground = isLightTheme() ? "rgba(247,251,255,0.98)" : "rgba(11,19,32,0.9)";
            var axisColor = isLightTheme() ? "rgba(90,116,153,0.35)" : "rgba(147,176,217,0.25)";

            function getX(index) {
                return leftPad + (index / Math.max(1, schedule.length - 1)) * xSpan;
            }

            function getY(value) {
                return height - bottomPad - (value / maxY) * ySpan;
            }

            function drawLine(values, color) {
                var i;
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.2;
                for (i = 0; i < pointsToRender; i += 1) {
                    var x = getX(i);
                    var y = getY(values[i]);
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            }

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = chartBackground;
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = axisColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(leftPad, topPad);
            ctx.lineTo(leftPad, height - bottomPad);
            ctx.lineTo(width - rightPad, height - bottomPad);
            ctx.stroke();

            drawLine(schedule.map(function (row) { return row.balance; }), "#2e8cff");
            drawLine(schedule.map(function (row) { return row.principalPaid; }), "#3de0c5");
            drawLine(schedule.map(function (row) { return row.interestPaid; }), "#f59e0b");
        }

        function animatePayoffChart(schedule, principal, totalInterest) {
            var startedAt = performance.now();
            var duration = 550;
            chartAnimationToken += 1;
            var token = chartAnimationToken;

            function frame(now) {
                if (token !== chartAnimationToken) {
                    return;
                }

                var elapsed = now - startedAt;
                var progress = Math.min(1, elapsed / duration);
                drawPayoffChart(schedule, principal, totalInterest, progress);

                if (progress < 1) {
                    requestAnimationFrame(frame);
                }
            }

            requestAnimationFrame(frame);
        }

        function setScenarioCard(months, principal, apr, monthlyNode, interestNode, durationNode) {
            var monthly = calculateMonthlyPayment(principal, apr, months);
            var totalRepayment = monthly * months;
            var totalInterest = totalRepayment - principal;

            monthlyNode.textContent = formatCurrency(monthly) + " / month";
            interestNode.textContent = "Total interest: " + formatCurrency(totalInterest);
            durationNode.textContent = "Duration: " + String(months) + " months";
        }

        function renderExampleTable(apr, months) {
            var amounts = [2000, 5000, 8000, 12000, 20000];

            examplePaymentsBody.innerHTML = amounts
                .map(function (amount) {
                    var monthly = calculateMonthlyPayment(amount, apr, months);
                    var total = monthly * months;
                    return (
                        "<tr><td>" +
                        formatCurrency(amount) +
                        "</td><td>" +
                        formatCurrency(monthly) +
                        "</td><td>" +
                        formatCurrency(total) +
                        "</td></tr>"
                    );
                })
                .join("");
        }

        function recalculate() {
            var principal = Number(amountRange.value);
            var apr = Number(aprRange.value);
            var months = Number(termRange.value);
            var monthly = calculateMonthlyPayment(principal, apr, months);
            var totalRepayment = monthly * months;
            var totalInterest = totalRepayment - principal;
            var payoffLabel = formatPayoffDate(months);
            var principalShare = Math.max(0, Math.min(100, (principal / Math.max(1, totalRepayment)) * 100));
            var interestShare = 100 - principalShare;
            var schedule = buildSchedule(principal, apr, months, monthly);
            var lowerMonths = Math.min(60, months + 12);
            var fasterMonths = Math.max(12, months - 12);

            amountValue.textContent = formatCurrency(principal);
            aprValue.textContent = formatPercent(apr);
            termValue.textContent = String(months) + " months";

            monthlyOutput.textContent = formatCurrency(monthly);
            repaymentOutput.textContent = formatCurrency(totalRepayment);
            interestOutput.textContent = formatCurrency(totalInterest);
            payoffOutput.textContent = payoffLabel;

            if (mobileMonthlyOutput) {
                mobileMonthlyOutput.textContent = formatCurrency(monthly);
            }
            if (mobileRepaymentOutput) {
                mobileRepaymentOutput.textContent = formatCurrency(totalRepayment);
            }
            if (mobileInterestOutput) {
                mobileInterestOutput.textContent = formatCurrency(totalInterest);
            }
            if (mobilePayoffOutput) {
                mobilePayoffOutput.textContent = payoffLabel;
            }

            principalLabel.textContent = formatPercent(principalShare);
            interestLabel.textContent = formatPercent(interestShare);
            principalBar.style.width = String(principalShare) + "%";
            interestBar.style.width = String(interestShare) + "%";

            drawPaymentMixChart(principal, totalInterest);
            animatePayoffChart(schedule, principal, totalInterest);
            renderExampleTable(apr, months);

            setScenarioCard(months, principal, apr, scenarioBalancedMonthly, scenarioBalancedInterest, scenarioBalancedDuration);
            setScenarioCard(lowerMonths, principal, apr, scenarioLowerMonthly, scenarioLowerInterest, scenarioLowerDuration);
            setScenarioCard(fasterMonths, principal, apr, scenarioFasterMonthly, scenarioFasterInterest, scenarioFasterDuration);
        }

        [amountRange, aprRange, termRange].forEach(function (input) {
            input.addEventListener("input", recalculate);
            input.addEventListener("change", recalculate);
        });
        window.addEventListener("themechange", recalculate);

        recalculate();
    }


    function initApplicationPage() {
        var form = document.getElementById("loanApplicationForm");
        var backButton = document.getElementById("applicationBack");
        var nextButton = document.getElementById("applicationNext");
        var submitButton = document.getElementById("applicationSubmit");
        var progressBar = document.getElementById("applicationProgressBar");
        var progressText = document.getElementById("applicationProgressText");
        var message = document.getElementById("applicationMessage");
        var successBox = document.getElementById("applicationSuccess");
        var provinceSelect = document.getElementById("province");
        var steps = Array.prototype.slice.call(document.querySelectorAll(".app-step"));
        var currentStep = 1;
        var finalStep = steps.length;

        if (
            !form ||
            !backButton ||
            !nextButton ||
            !submitButton ||
            !progressBar ||
            !progressText ||
            !message ||
            !successBox ||
            !provinceSelect ||
            finalStep === 0
        ) {
            return;
        }

        function updateStepUi() {
            steps.forEach(function (step) {
                var stepNumber = Number(step.getAttribute("data-step"));
                step.classList.toggle("hidden", stepNumber !== currentStep);
            });

            progressBar.style.width = String((currentStep / finalStep) * 100) + "%";
            progressText.textContent = "Step " + String(currentStep) + " of " + String(finalStep);
            backButton.classList.toggle("hidden", currentStep === 1);
            nextButton.classList.toggle("hidden", currentStep === finalStep);
            submitButton.classList.toggle("hidden", currentStep !== finalStep);
        }

        function validateCurrentStep() {
            var stepElement = document.querySelector('.app-step[data-step="' + String(currentStep) + '"]');

            if (!stepElement) {
                return false;
            }

            var fields = stepElement.querySelectorAll("input, select, textarea");
            for (var i = 0; i < fields.length; i += 1) {
                var field = fields[i];
                if (!field.checkValidity()) {
                    field.reportValidity();
                    return false;
                }
            }

            return true;
        }

        function getApplicationPayload() {
            return {
                loanRequest: {
                    requestedAmount: Number(document.getElementById("requestedAmount").value),
                    loanPurpose: document.getElementById("loanPurpose").value,
                    province: document.getElementById("province").value,
                    preferredTermMonths: Number(document.getElementById("preferredTermMonths").value)
                },
                identity: {
                    firstName: document.getElementById("firstName").value.trim(),
                    lastName: document.getElementById("lastName").value.trim(),
                    dateOfBirth: document.getElementById("dateOfBirth").value,
                    email: document.getElementById("email").value.trim(),
                    phone: document.getElementById("phone").value.trim(),
                    sinLast4: document.getElementById("sinLast4").value.trim()
                },
                address: {
                    streetAddress: document.getElementById("streetAddress").value.trim(),
                    city: document.getElementById("city").value.trim(),
                    postalCode: document.getElementById("postalCode").value.trim().toUpperCase(),
                    housingStatus: document.getElementById("housingStatus").value,
                    monthlyHousingCost: Number(document.getElementById("monthlyHousingCost").value),
                    timeAtAddressMonths: Number(document.getElementById("timeAtAddressMonths").value)
                },
                employment: {
                    employmentStatus: document.getElementById("employmentStatus").value,
                    employerName: document.getElementById("employerName").value.trim(),
                    jobTitle: document.getElementById("jobTitle").value.trim(),
                    timeEmployedMonths: Number(document.getElementById("timeEmployedMonths").value),
                    monthlyIncome: Number(document.getElementById("monthlyIncome").value),
                    incomeFrequency: document.getElementById("incomeFrequency").value
                },
                obligations: {
                    creditScoreRange: document.getElementById("creditScoreRange").value,
                    existingDebtPayments: Number(document.getElementById("existingDebtPayments").value),
                    bankruptcies: document.getElementById("bankruptcies").value,
                    coApplicant: document.getElementById("coApplicant").value
                },
                banking: {
                    bankName: document.getElementById("bankName").value.trim(),
                    bankAccountType: document.getElementById("bankAccountType").value,
                    directDeposit: document.getElementById("directDeposit").value,
                    nextPayDate: document.getElementById("nextPayDate").value,
                    fundingMethod: document.getElementById("fundingMethod").value
                },
                compliance: {
                    idType: document.getElementById("idType").value,
                    idNumber: document.getElementById("idNumber").value.trim(),
                    consentCreditCheck: document.getElementById("consentCreditCheck").value,
                    consentElectronicDocs: document.getElementById("consentElectronicDocs").value,
                    consentPrivacy: document.getElementById("consentPrivacy").value
                }
            };
        }

        var queryProvince = new URLSearchParams(window.location.search).get("province");
        if (queryProvince) {
            provinceSelect.value = queryProvince.toUpperCase();
        }

        backButton.addEventListener("click", function () {
            if (currentStep > 1) {
                currentStep -= 1;
                updateStepUi();
            }
        });

        nextButton.addEventListener("click", function () {
            if (!validateCurrentStep()) {
                return;
            }

            if (currentStep < finalStep) {
                currentStep += 1;
                updateStepUi();
            }
        });

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!validateCurrentStep()) {
                return;
            }

            var payload = getApplicationPayload();

            if (
                payload.compliance.consentCreditCheck !== "yes" ||
                payload.compliance.consentElectronicDocs !== "yes" ||
                payload.compliance.consentPrivacy !== "yes"
            ) {
                message.textContent = "You must provide all required consents to submit.";
                message.style.color = "#ff6b6b";
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
            message.textContent = "";

            apiRequest("/api/loan-applications", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })
                .then(function () {
                    form.style.display = "none";
                    successBox.style.display = "block";
                    message.textContent = "Submission complete.";
                    message.style.color = "#3de0c5";
                })
                .catch(function (error) {
                    message.textContent = error.message || "Submission failed. Please try again.";
                    message.style.color = "#ff6b6b";
                })
                .finally(function () {
                    submitButton.disabled = false;
                    submitButton.textContent = "Submit Application";
                });
        });

        updateStepUi();
    }

    function initAboutPage() {
        var cards = document.querySelectorAll(".card");

        cards.forEach(function (card) {
            card.addEventListener("click", function () {
                var text = card.querySelector(".card-text");

                if (!text) {
                    return;
                }

                if (card.dataset.state === "collapsed") {
                    text.textContent = text.textContent + " This step creates clarity and removes friction from your routine.";
                    card.dataset.state = "expanded";
                } else {
                    var original = text.textContent.split(" This step")[0];
                    text.textContent = original;
                    card.dataset.state = "collapsed";
                }
            });
        });
    }

    function initBlogPage() {
        var buttons = document.querySelectorAll(".filter-btn");
        var posts = document.querySelectorAll(".post-card");

        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                var activeButton = document.querySelector(".filter-btn.active");

                if (activeButton) {
                    activeButton.classList.remove("active");
                }

                button.classList.add("active");

                var filter = button.dataset.filter;

                posts.forEach(function (post) {
                    if (filter === "all" || post.dataset.category === filter) {
                        post.style.display = "block";
                    } else {
                        post.style.display = "none";
                    }
                });
            });
        });
    }

    function initBrandCollabPage() {
        var budgetSelect = document.getElementById("budgetSelect");
        var alignmentQuestion = document.getElementById("alignmentQuestion");
        var form = document.getElementById("collabForm");
        var successBox = document.getElementById("successBox");

        if (!budgetSelect || !alignmentQuestion || !form || !successBox) {
            return;
        }

        budgetSelect.addEventListener("change", function () {
            if (this.value === "mid" || this.value === "high") {
                alignmentQuestion.classList.remove("hidden");
            } else {
                alignmentQuestion.classList.add("hidden");
            }
        });

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            var budget = budgetSelect.value;

            if (budget === "low") {
                alert("Minimum campaign budget typically starts above $1,000.");
                return;
            }

            form.style.display = "none";
            successBox.style.display = "block";
        });
    }

    function initContactPage() {
        var form = document.getElementById("contactForm");
        var successBox = document.getElementById("successBox");
        var inquiryType = document.getElementById("inquiryType");

        if (!form || !successBox || !inquiryType) {
            return;
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            if (inquiryType.value === "brand") {
                window.location.href = "/brand-collab/";
                return;
            }

            form.style.display = "none";
            successBox.style.display = "block";
        });
    }

    function initMediaKitPage() {
        var element = document.getElementById("followers");
        var count = 0;
        var target = 25000;

        if (!element) {
            return;
        }

        function animateCounter() {
            if (count < target) {
                count += Math.ceil(target / 100);
                element.textContent = count.toLocaleString();
                requestAnimationFrame(animateCounter);
            } else {
                element.textContent = target.toLocaleString();
            }
        }

        window.addEventListener("load", animateCounter);
    }

    function initPremiumPage() {
        var waitlistForm = document.getElementById("waitlistForm");
        var waitlistSuccess = document.getElementById("waitlistSuccess");

        if (!waitlistForm || !waitlistSuccess) {
            return;
        }

        waitlistForm.addEventListener("submit", function (e) {
            e.preventDefault();

            var emailInput = document.getElementById("waitlistEmail");
            var email = emailInput ? emailInput.value.trim() : "";

            if (email.includes("@")) {
                waitlistForm.style.display = "none";
                waitlistSuccess.style.display = "block";
            } else {
                alert("Enter a valid email.");
            }
        });
    }

    function initResourcesPage() {
        var buttons = document.querySelectorAll(".btn");

        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                this.textContent = "Opening...";
            });
        });
    }

    function initStarterPlanPage() {
        var form = document.getElementById("starterForm");
        var successBox = document.getElementById("successBox");

        if (!form || !successBox) {
            return;
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            var nameInput = document.getElementById("name");
            var emailInput = document.getElementById("email");
            var name = nameInput ? nameInput.value.trim() : "";
            var email = emailInput ? emailInput.value.trim() : "";

            if (name.length > 1 && email.includes("@")) {
                form.style.display = "none";
                successBox.style.display = "block";
            } else {
                alert("Please enter valid information.");
            }
        });
    }

    function initDebtConsolidationPage() {
        var form = document.getElementById("debtCompareForm");
        var cardInput = document.getElementById("debtCardPayment");
        var personalInput = document.getElementById("debtPersonalPayment");
        var autoInput = document.getElementById("debtAutoPayment");
        var newPaymentInput = document.getElementById("debtNewPayment");
        var totalOutput = document.getElementById("debtCurrentTotal");
        var savingsOutput = document.getElementById("debtMonthlySavings");

        if (!form || !cardInput || !personalInput || !autoInput || !newPaymentInput || !totalOutput || !savingsOutput) {
            return;
        }

        function formatCurrency(value) {
            return new Intl.NumberFormat("en-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 0
            }).format(value);
        }

        function recalculate() {
            var total = Number(cardInput.value) + Number(personalInput.value) + Number(autoInput.value);
            var newPayment = Number(newPaymentInput.value);
            var savings = total - newPayment;

            totalOutput.textContent = formatCurrency(total);
            savingsOutput.textContent = formatCurrency(savings);
            savingsOutput.style.color = savings >= 0 ? "#3de0c5" : "#ff6b6b";
        }

        form.addEventListener("input", recalculate);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            recalculate();
        });

        recalculate();
    }

    function initAutoLoanPage() {
        var form = document.getElementById("autoLoanForm");
        var priceInput = document.getElementById("vehiclePrice");
        var downInput = document.getElementById("downPayment");
        var tradeInput = document.getElementById("tradeInValue");
        var termInput = document.getElementById("autoTermMonths");
        var aprInput = document.getElementById("autoApr");
        var amountOutput = document.getElementById("autoLoanAmount");
        var monthlyOutput = document.getElementById("autoMonthlyPayment");
        var chartBar = document.getElementById("autoPayoffFill");

        if (!form || !priceInput || !downInput || !tradeInput || !termInput || !aprInput || !amountOutput || !monthlyOutput || !chartBar) {
            return;
        }

        function formatCurrency(value) {
            return new Intl.NumberFormat("en-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 2
            }).format(value);
        }

        function monthlyPayment(principal, apr, months) {
            var monthlyRate = apr / 100 / 12;
            if (monthlyRate === 0) {
                return principal / months;
            }

            return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
        }

        function recalc() {
            var principal = Math.max(0, Number(priceInput.value) - Number(downInput.value) - Number(tradeInput.value));
            var months = Math.max(12, Number(termInput.value));
            var apr = Math.max(0, Number(aprInput.value));
            var monthly = monthlyPayment(principal, apr, months);

            amountOutput.textContent = formatCurrency(principal);
            monthlyOutput.textContent = formatCurrency(monthly);
            chartBar.style.width = String(Math.max(8, Math.min(100, (months / 84) * 100))) + "%";
        }

        form.addEventListener("input", recalc);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            recalc();
        });

        recalc();
    }

    function calculateMonthlyInstallment(principal, apr, months) {
        var monthlyRate = apr / 100 / 12;
        if (monthlyRate === 0) {
            return principal / months;
        }
        return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
    }

    function formatCad(value, maxFractionDigits) {
        return new Intl.NumberFormat("en-CA", {
            style: "currency",
            currency: "CAD",
            maximumFractionDigits: typeof maxFractionDigits === "number" ? maxFractionDigits : 2
        }).format(value);
    }

    function initBorrowingPowerPage() {
        var form = document.getElementById("borrowingPowerForm");
        var incomeInput = document.getElementById("bpIncome");
        var housingInput = document.getElementById("bpHousing");
        var debtsInput = document.getElementById("bpDebts");
        var creditInput = document.getElementById("bpCredit");
        var termInput = document.getElementById("bpTerm");
        var rateInput = document.getElementById("bpRate");
        var safeLoanOutput = document.getElementById("bpSafeLoan");
        var paymentOutput = document.getElementById("bpPayment");
        var dtiOutput = document.getElementById("bpDti");
        var riskTextOutput = document.getElementById("bpRiskText");
        var riskBadgeOutput = document.getElementById("bpRiskBadge");
        var messageOutput = document.getElementById("bpMessage");

        if (
            !form || !incomeInput || !housingInput || !debtsInput || !creditInput || !termInput || !rateInput ||
            !safeLoanOutput || !paymentOutput || !dtiOutput || !riskTextOutput || !riskBadgeOutput || !messageOutput
        ) {
            return;
        }

        function recalculate() {
            var income = Number(incomeInput.value);
            var housing = Number(housingInput.value);
            var debts = Number(debtsInput.value);
            var termMonths = Number(termInput.value);
            var apr = Number(rateInput.value);
            var credit = creditInput.value;
            var creditAdjust = 0.77;
            var targetDti = 0.34;
            var availablePayment;
            var safeLoan;
            var currentDti;
            var projectedDti;
            var risk = "Moderate";

            if (
                !Number.isFinite(income) ||
                !Number.isFinite(housing) ||
                !Number.isFinite(debts) ||
                !Number.isFinite(termMonths) ||
                !Number.isFinite(apr) ||
                income <= 0 ||
                housing < 0 ||
                debts < 0 ||
                termMonths <= 0 ||
                apr < 0
            ) {
                messageOutput.textContent = "Enter valid values to estimate borrowing power.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            if (credit === "excellent") {
                creditAdjust = 0.92;
                targetDti = 0.36;
            } else if (credit === "good") {
                creditAdjust = 0.77;
                targetDti = 0.34;
            } else if (credit === "fair") {
                creditAdjust = 0.62;
                targetDti = 0.31;
            } else {
                creditAdjust = 0.48;
                targetDti = 0.28;
            }

            availablePayment = Math.max(0, (income * targetDti - housing - debts) * creditAdjust);
            safeLoan = apr === 0
                ? availablePayment * termMonths
                : availablePayment * ((1 - Math.pow(1 + apr / 1200, -termMonths)) / (apr / 1200));
            currentDti = income > 0 ? (housing + debts) / income : 0;
            projectedDti = income > 0 ? (housing + debts + availablePayment) / income : 0;

            if (projectedDti <= 0.35) {
                risk = "Healthy";
                riskBadgeOutput.className = "risk-badge healthy";
            } else if (projectedDti <= 0.43) {
                risk = "Moderate";
                riskBadgeOutput.className = "risk-badge moderate";
            } else {
                risk = "Risky";
                riskBadgeOutput.className = "risk-badge risky";
            }

            safeLoanOutput.textContent = formatCad(Math.max(0, safeLoan), 0);
            paymentOutput.textContent = formatCad(Math.max(0, availablePayment), 0);
            dtiOutput.textContent = String(Math.round(currentDti * 100)) + "%";
            riskTextOutput.textContent = risk;
            riskBadgeOutput.textContent = risk;
            messageOutput.textContent = "Estimate uses affordability guardrails and credit-based payment buffers.";
            messageOutput.style.color = "#3de0c5";
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initEarlyPayoffPage() {
        var form = document.getElementById("earlyPayoffForm");
        var amountInput = document.getElementById("epAmount");
        var rateInput = document.getElementById("epRate");
        var termInput = document.getElementById("epTerm");
        var extraInput = document.getElementById("epExtra");
        var baseOutput = document.getElementById("epBaseMonthly");
        var earlyOutput = document.getElementById("epMonthsEarly");
        var interestOutput = document.getElementById("epInterestSaved");
        var timelineOutput = document.getElementById("epNewTimeline");

        if (!form || !amountInput || !rateInput || !termInput || !extraInput || !baseOutput || !earlyOutput || !interestOutput || !timelineOutput) {
            return;
        }

        function payoffMonths(principal, apr, payment) {
            var monthlyRate = apr / 100 / 12;
            var balance = principal;
            var months = 0;
            var interestPaid = 0;

            while (balance > 0.01 && months < 1200) {
                var monthlyInterest = balance * monthlyRate;
                var principalPaid = payment - monthlyInterest;

                if (principalPaid <= 0) {
                    return { months: 1200, interestPaid: Number.POSITIVE_INFINITY };
                }

                balance -= principalPaid;
                interestPaid += monthlyInterest;
                months += 1;
            }

            return { months: months, interestPaid: interestPaid };
        }

        function recalculate() {
            var amount = Number(amountInput.value);
            var rate = Number(rateInput.value);
            var term = Number(termInput.value);
            var extra = Number(extraInput.value);
            var baseMonthly = calculateMonthlyInstallment(amount, rate, term);
            var baseInterest = baseMonthly * term - amount;
            var accelerated = payoffMonths(amount, rate, baseMonthly + extra);
            var monthsEarly = Math.max(0, term - accelerated.months);
            var interestSaved = Math.max(0, baseInterest - accelerated.interestPaid);

            baseOutput.textContent = formatCad(baseMonthly);
            earlyOutput.textContent = String(monthsEarly) + " months";
            interestOutput.textContent = formatCad(interestSaved, 0);
            timelineOutput.textContent = String(accelerated.months) + " months";
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function simulateDebtPayoff(principal, apr, monthlyPayment) {
        var monthlyRate = apr / 100 / 12;
        var balance = principal;
        var interestPaid = 0;
        var months = 0;

        if (monthlyPayment <= 0 || principal <= 0 || apr < 0) {
            return null;
        }

        while (balance > 0.01 && months < 1200) {
            var interest = balance * monthlyRate;
            var principalPaid = monthlyPayment - interest;

            if (principalPaid <= 0) {
                return null;
            }

            if (principalPaid > balance) {
                principalPaid = balance;
            }

            balance -= principalPaid;
            interestPaid += interest;
            months += 1;
        }

        if (months >= 1200) {
            return null;
        }

        return {
            months: months,
            interestPaid: interestPaid
        };
    }

    function initDebtPayoffPlannerPage() {
        var form = document.getElementById("debtPayoffPlannerForm");
        var debtInput = document.getElementById("dpDebt");
        var aprInput = document.getElementById("dpApr");
        var paymentInput = document.getElementById("dpMonthlyPayment");
        var extraInput = document.getElementById("dpExtraPayment");
        var debtFreeOutput = document.getElementById("dpDebtFree");
        var monthsSavedOutput = document.getElementById("dpMonthsSaved");
        var interestSavedOutput = document.getElementById("dpInterestSaved");
        var recommendedOutput = document.getElementById("dpRecommendedPayment");
        var messageOutput = document.getElementById("dpMessage");

        if (
            !form || !debtInput || !aprInput || !paymentInput || !extraInput || !debtFreeOutput ||
            !monthsSavedOutput || !interestSavedOutput || !recommendedOutput || !messageOutput
        ) {
            return;
        }

        function recalculate() {
            var debt = Number(debtInput.value);
            var apr = Number(aprInput.value);
            var payment = Number(paymentInput.value);
            var extra = Number(extraInput.value);
            var base;
            var accelerated;
            var boostedPayment = payment + extra;

            if (
                !Number.isFinite(debt) ||
                !Number.isFinite(apr) ||
                !Number.isFinite(payment) ||
                !Number.isFinite(extra) ||
                debt <= 0 ||
                apr < 0 ||
                payment <= 0 ||
                extra < 0
            ) {
                messageOutput.textContent = "Enter valid values to estimate your debt payoff plan.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            base = simulateDebtPayoff(debt, apr, payment);
            accelerated = simulateDebtPayoff(debt, apr, boostedPayment);

            if (!base || !accelerated) {
                messageOutput.textContent = "Your payment is too low for this balance and APR. Increase monthly payment.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            debtFreeOutput.textContent = String(accelerated.months) + " months";
            monthsSavedOutput.textContent = String(Math.max(0, base.months - accelerated.months)) + " months";
            interestSavedOutput.textContent = formatCad(Math.max(0, base.interestPaid - accelerated.interestPaid), 0);
            recommendedOutput.textContent = formatCad(boostedPayment, 0);
            messageOutput.textContent = "Plan updated. Compare this with your budget and savings targets.";
            messageOutput.style.color = "#3de0c5";
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initSavingsGrowthPage() {
        var form = document.getElementById("savingsGrowthForm");
        var initialInput = document.getElementById("sgInitial");
        var monthlyInput = document.getElementById("sgMonthly");
        var rateInput = document.getElementById("sgRate");
        var yearsInput = document.getElementById("sgYears");
        var compoundInput = document.getElementById("sgCompound");
        var finalOutput = document.getElementById("sgFinalBalance");
        var contribOutput = document.getElementById("sgContributions");
        var growthOutput = document.getElementById("sgGrowth");
        var monthlyGoalOutput = document.getElementById("sgMonthlyGoal");
        var messageOutput = document.getElementById("sgMessage");

        if (
            !form || !initialInput || !monthlyInput || !rateInput || !yearsInput || !compoundInput ||
            !finalOutput || !contribOutput || !growthOutput || !monthlyGoalOutput || !messageOutput
        ) {
            return;
        }

        function recalculate() {
            var initial = Number(initialInput.value);
            var monthly = Number(monthlyInput.value);
            var annualRate = Number(rateInput.value);
            var years = Number(yearsInput.value);
            var compoundingPerYear = Number(compoundInput.value);
            var months = Math.round(years * 12);
            var periodicRate = annualRate / 100 / compoundingPerYear;
            var effectiveMonthlyRate = Math.pow(1 + periodicRate, compoundingPerYear / 12) - 1;
            var balance = initial;
            var i;
            var contributions;
            var growth;

            if (
                !Number.isFinite(initial) ||
                !Number.isFinite(monthly) ||
                !Number.isFinite(annualRate) ||
                !Number.isFinite(years) ||
                !Number.isFinite(compoundingPerYear) ||
                initial < 0 ||
                monthly < 0 ||
                annualRate < 0 ||
                years <= 0 ||
                months <= 0 ||
                compoundingPerYear <= 0
            ) {
                messageOutput.textContent = "Enter valid values to project savings growth.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            for (i = 0; i < months; i += 1) {
                balance = balance * (1 + effectiveMonthlyRate) + monthly;
            }

            contributions = initial + monthly * months;
            growth = balance - contributions;

            finalOutput.textContent = formatCad(balance, 0);
            contribOutput.textContent = formatCad(contributions, 0);
            growthOutput.textContent = formatCad(Math.max(0, growth), 0);
            monthlyGoalOutput.textContent = formatCad(Math.max(0, balance / months), 0);
            messageOutput.textContent = "Projection updated. Test contribution changes to reach goals faster.";
            messageOutput.style.color = "#3de0c5";
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initMortgagePaymentPage() {
        var form = document.getElementById("mortgagePaymentForm");
        var priceInput = document.getElementById("mpHomePrice");
        var downInput = document.getElementById("mpDownPayment");
        var rateInput = document.getElementById("mpRate");
        var yearsInput = document.getElementById("mpYears");
        var taxInput = document.getElementById("mpTax");
        var heatingInput = document.getElementById("mpHeating");
        var principalOutput = document.getElementById("mpPrincipal");
        var monthlyOutput = document.getElementById("mpMonthlyMortgage");
        var totalHousingOutput = document.getElementById("mpTotalHousing");
        var totalInterestOutput = document.getElementById("mpTotalInterest");
        var messageOutput = document.getElementById("mpMessage");

        if (
            !form || !priceInput || !downInput || !rateInput || !yearsInput || !taxInput || !heatingInput ||
            !principalOutput || !monthlyOutput || !totalHousingOutput || !totalInterestOutput || !messageOutput
        ) {
            return;
        }

        function recalculate() {
            var homePrice = Number(priceInput.value);
            var downPayment = Number(downInput.value);
            var rate = Number(rateInput.value);
            var years = Number(yearsInput.value);
            var tax = Number(taxInput.value);
            var heating = Number(heatingInput.value);
            var principal;
            var months;
            var monthlyMortgage;
            var totalInterest;

            if (
                !Number.isFinite(homePrice) ||
                !Number.isFinite(downPayment) ||
                !Number.isFinite(rate) ||
                !Number.isFinite(years) ||
                !Number.isFinite(tax) ||
                !Number.isFinite(heating) ||
                homePrice <= 0 ||
                downPayment < 0 ||
                downPayment >= homePrice ||
                rate < 0 ||
                years <= 0 ||
                tax < 0 ||
                heating < 0
            ) {
                messageOutput.textContent = "Enter valid values. Down payment must be less than home price.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            principal = homePrice - downPayment;
            months = Math.round(years * 12);
            monthlyMortgage = calculateMonthlyInstallment(principal, rate, months);
            totalInterest = monthlyMortgage * months - principal;

            principalOutput.textContent = formatCad(principal, 0);
            monthlyOutput.textContent = formatCad(monthlyMortgage, 0);
            totalHousingOutput.textContent = formatCad(monthlyMortgage + tax + heating, 0);
            totalInterestOutput.textContent = formatCad(Math.max(0, totalInterest), 0);
            messageOutput.textContent = "Estimate updated. Use this with your budget and debt plan for full affordability.";
            messageOutput.style.color = "#3de0c5";
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initInvestmentReturnPage() {
        var form = document.getElementById("investmentReturnForm");
        var initialInput = document.getElementById("irInitial");
        var monthlyInput = document.getElementById("irMonthly");
        var returnInput = document.getElementById("irReturn");
        var yearsInput = document.getElementById("irYears");
        var feeInput = document.getElementById("irFee");
        var inflationInput = document.getElementById("irInflation");
        var futureOutput = document.getElementById("irFutureValue");
        var realOutput = document.getElementById("irInflationAdjusted");
        var contribOutput = document.getElementById("irContributed");
        var gainOutput = document.getElementById("irNetGain");
        var messageOutput = document.getElementById("irMessage");

        if (
            !form || !initialInput || !monthlyInput || !returnInput || !yearsInput || !feeInput || !inflationInput ||
            !futureOutput || !realOutput || !contribOutput || !gainOutput || !messageOutput
        ) {
            return;
        }

        function recalculate() {
            var initial = Number(initialInput.value);
            var monthly = Number(monthlyInput.value);
            var annualReturn = Number(returnInput.value);
            var years = Number(yearsInput.value);
            var fee = Number(feeInput.value);
            var inflation = Number(inflationInput.value);
            var months = Math.round(years * 12);
            var netAnnualReturn = Math.max(-99, annualReturn - fee);
            var monthlyRate = netAnnualReturn / 100 / 12;
            var inflationFactor = Math.pow(1 + inflation / 100, years);
            var balance = initial;
            var i;
            var contributed;
            var realValue;

            if (
                !Number.isFinite(initial) ||
                !Number.isFinite(monthly) ||
                !Number.isFinite(annualReturn) ||
                !Number.isFinite(years) ||
                !Number.isFinite(fee) ||
                !Number.isFinite(inflation) ||
                initial < 0 ||
                monthly < 0 ||
                years <= 0 ||
                fee < 0 ||
                inflation < 0
            ) {
                messageOutput.textContent = "Enter valid values to estimate investment growth.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            for (i = 0; i < months; i += 1) {
                balance = balance * (1 + monthlyRate) + monthly;
            }

            contributed = initial + monthly * months;
            realValue = inflationFactor > 0 ? balance / inflationFactor : balance;

            futureOutput.textContent = formatCad(balance, 0);
            realOutput.textContent = formatCad(realValue, 0);
            contribOutput.textContent = formatCad(contributed, 0);
            gainOutput.textContent = formatCad(balance - contributed, 0);
            messageOutput.textContent = "Projection updated. Compare fee levels and contribution rates for better outcomes.";
            messageOutput.style.color = "#3de0c5";
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initBudgetPlannerPage() {
        var form = document.getElementById("budgetPlannerForm");
        var incomeInput = document.getElementById("bpnIncome");
        var housingInput = document.getElementById("bpnHousing");
        var utilitiesInput = document.getElementById("bpnUtilities");
        var foodInput = document.getElementById("bpnFood");
        var transportInput = document.getElementById("bpnTransport");
        var debtInput = document.getElementById("bpnDebt");
        var miscInput = document.getElementById("bpnMisc");
        var savingsGoalInput = document.getElementById("bpnSavingsGoal");
        var expensesOutput = document.getElementById("bpnTotalExpenses");
        var leftoverOutput = document.getElementById("bpnLeftover");
        var savingsRateOutput = document.getElementById("bpnSavingsRate");
        var statusOutput = document.getElementById("bpnBudgetStatus");
        var messageOutput = document.getElementById("bpnMessage");

        if (
            !form || !incomeInput || !housingInput || !utilitiesInput || !foodInput || !transportInput ||
            !debtInput || !miscInput || !savingsGoalInput || !expensesOutput || !leftoverOutput ||
            !savingsRateOutput || !statusOutput || !messageOutput
        ) {
            return;
        }

        function recalculate() {
            var income = Number(incomeInput.value);
            var housing = Number(housingInput.value);
            var utilities = Number(utilitiesInput.value);
            var food = Number(foodInput.value);
            var transport = Number(transportInput.value);
            var debt = Number(debtInput.value);
            var misc = Number(miscInput.value);
            var savingsGoal = Number(savingsGoalInput.value);
            var totalExpenses;
            var leftover;
            var savingsRate;

            if (
                !Number.isFinite(income) ||
                !Number.isFinite(housing) ||
                !Number.isFinite(utilities) ||
                !Number.isFinite(food) ||
                !Number.isFinite(transport) ||
                !Number.isFinite(debt) ||
                !Number.isFinite(misc) ||
                !Number.isFinite(savingsGoal) ||
                income <= 0 ||
                housing < 0 ||
                utilities < 0 ||
                food < 0 ||
                transport < 0 ||
                debt < 0 ||
                misc < 0 ||
                savingsGoal < 0
            ) {
                messageOutput.textContent = "Enter valid monthly budget values.";
                messageOutput.style.color = "#ff6b6b";
                return;
            }

            totalExpenses = housing + utilities + food + transport + debt + misc;
            leftover = income - totalExpenses - savingsGoal;
            savingsRate = (savingsGoal / income) * 100;

            expensesOutput.textContent = formatCad(totalExpenses, 0);
            leftoverOutput.textContent = formatCad(leftover, 0);
            savingsRateOutput.textContent = String(Math.round(savingsRate * 10) / 10) + "%";

            if (leftover >= 0) {
                statusOutput.textContent = "On track";
                statusOutput.style.color = "#3de0c5";
                messageOutput.textContent = "Budget is sustainable with your savings goal.";
                messageOutput.style.color = "#3de0c5";
            } else {
                statusOutput.textContent = "Over budget";
                statusOutput.style.color = "#ff6b6b";
                messageOutput.textContent = "Reduce expenses or adjust goals to avoid a monthly shortfall.";
                messageOutput.style.color = "#ff6b6b";
            }
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initRateImpactPage() {
        var form = document.getElementById("rateImpactForm");
        var amountInput = document.getElementById("riAmount");
        var termInput = document.getElementById("riTerm");
        var rateRows = [6, 11, 18, 29];

        if (!form || !amountInput || !termInput) {
            return;
        }

        function recalculate() {
            var amount = Number(amountInput.value);
            var term = Number(termInput.value);

            rateRows.forEach(function (rate) {
                var monthly = calculateMonthlyInstallment(amount, rate, term);
                var total = monthly * term;
                var monthlyNode = document.getElementById("ri" + String(rate) + "Monthly");
                var totalNode = document.getElementById("ri" + String(rate) + "Total");

                if (monthlyNode) {
                    monthlyNode.textContent = formatCad(monthly);
                }
                if (totalNode) {
                    totalNode.textContent = formatCad(total);
                }
            });
        }

        form.addEventListener("input", recalculate);
        recalculate();
    }

    function initScenarioSimulatorPage() {
        var form = document.getElementById("financialSimulatorForm");
        var amountInput = document.getElementById("fsLoanAmount");
        var rateInput = document.getElementById("fsInterestRate");
        var termInput = document.getElementById("fsTermMonths");
        var startMonthInput = document.getElementById("fsStartMonth");
        var extraInput = document.getElementById("fsExtraPayment");
        var incomeInput = document.getElementById("fsIncome");
        var expensesInput = document.getElementById("fsExpenses");
        var existingDebtInput = document.getElementById("fsExistingDebt");
        var rateIncreaseInput = document.getElementById("fsRateIncrease");
        var incomeDropInput = document.getElementById("fsIncomeDrop");
        var unexpectedExpenseInput = document.getElementById("fsUnexpectedExpense");
        var monthlyOutput = document.getElementById("fsMonthlyPayment");
        var repaymentOutput = document.getElementById("fsTotalRepayment");
        var interestOutput = document.getElementById("fsTotalInterest");
        var payoffOutput = document.getElementById("fsPayoffDate");
        var extraPayoffOutput = document.getElementById("fsExtraPayoffDate");
        var interestSavedOutput = document.getElementById("fsInterestSaved");
        var monthsReducedOutput = document.getElementById("fsMonthsReduced");
        var dtiOutput = document.getElementById("fsDtiRatio");
        var dtiClassOutput = document.getElementById("fsDtiClass");
        var dtiMeterFill = document.getElementById("fsDtiMeterFill");
        var stressRiskOutput = document.getElementById("fsStressRisk");
        var stressBadgeOutput = document.getElementById("fsStressBadge");
        var stressMeter = document.getElementById("fsStressMeter");
        var shockPaymentOutput = document.getElementById("fsShockPayment");
        var shockDtiOutput = document.getElementById("fsShockDti");
        var healthScoreOutput = document.getElementById("fsHealthScore");
        var strengthsOutput = document.getElementById("fsStrengths");
        var concernsOutput = document.getElementById("fsConcerns");
        var recommendationsOutput = document.getElementById("fsRecommendations");
        var pieChart = document.getElementById("fsPieChart");
        var payoffChart = document.getElementById("fsPayoffChart");
        var borrowingForm = document.getElementById("fsBorrowingPowerForm");
        var bpIncomeInput = document.getElementById("fsBpIncome");
        var bpExpensesInput = document.getElementById("fsBpExpenses");
        var bpDebtInput = document.getElementById("fsBpDebt");
        var bpRateInput = document.getElementById("fsBpRate");
        var bpTermInput = document.getElementById("fsBpTerm");
        var borrowingOutput = document.getElementById("fsBorrowingPower");
        var borrowingPaymentOutput = document.getElementById("fsBorrowingPayment");
        var consolidationForm = document.getElementById("fsConsolidationForm");
        var debt1BalanceInput = document.getElementById("fsDebt1Balance");
        var debt1RateInput = document.getElementById("fsDebt1Rate");
        var debt2BalanceInput = document.getElementById("fsDebt2Balance");
        var debt2RateInput = document.getElementById("fsDebt2Rate");
        var debt3BalanceInput = document.getElementById("fsDebt3Balance");
        var debt3RateInput = document.getElementById("fsDebt3Rate");
        var currentDebtTermInput = document.getElementById("fsCurrentDebtTerm");
        var consolidatedRateInput = document.getElementById("fsConsolidatedRate");
        var consolidatedTermInput = document.getElementById("fsConsolidatedTerm");
        var currentDebtPaymentOutput = document.getElementById("fsCurrentDebtPayment");
        var consolidatedPaymentOutput = document.getElementById("fsConsolidatedPayment");
        var consolidationSavingsOutput = document.getElementById("fsConsolidationSavings");

        function isLightTheme() {
            return document.documentElement.getAttribute("data-theme") === "light" ||
                document.body.getAttribute("data-theme") === "light";
        }

        if (
            !form || !amountInput || !rateInput || !termInput || !startMonthInput || !extraInput ||
            !incomeInput || !expensesInput || !existingDebtInput || !rateIncreaseInput || !incomeDropInput ||
            !unexpectedExpenseInput || !monthlyOutput || !repaymentOutput || !interestOutput || !payoffOutput ||
            !extraPayoffOutput || !interestSavedOutput || !monthsReducedOutput || !dtiOutput || !dtiClassOutput ||
            !dtiMeterFill || !stressRiskOutput || !stressBadgeOutput || !shockPaymentOutput || !shockDtiOutput ||
            !healthScoreOutput || !strengthsOutput || !concernsOutput || !recommendationsOutput || !borrowingForm ||
            !bpIncomeInput || !bpExpensesInput || !bpDebtInput || !bpRateInput || !bpTermInput || !borrowingOutput ||
            !borrowingPaymentOutput || !consolidationForm || !debt1BalanceInput || !debt1RateInput ||
            !debt2BalanceInput || !debt2RateInput || !debt3BalanceInput || !debt3RateInput || !currentDebtTermInput ||
            !consolidatedRateInput || !consolidatedTermInput || !currentDebtPaymentOutput ||
            !consolidatedPaymentOutput || !consolidationSavingsOutput
        ) {
            return;
        }

        function formatPercent(value) {
            return String(Math.round(value * 10) / 10) + "%";
        }

        function parseMonthInput(value) {
            if (!/^\d{4}-\d{2}$/.test(value)) {
                return null;
            }

            var parts = value.split("-");
            var year = Number(parts[0]);
            var month = Number(parts[1]);
            if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
                return null;
            }

            return new Date(year, month - 1, 1);
        }

        function monthLabel(date) {
            return date.toLocaleDateString("en-CA", {
                month: "long",
                year: "numeric"
            });
        }

        function getBasePayment(principal, apr, months) {
            if (principal <= 0 || months <= 0) {
                return 0;
            }
            return calculateMonthlyInstallment(principal, apr, months);
        }

        function runAmortization(principal, apr, months, extraMonthlyPayment) {
            var payment = getBasePayment(principal, apr, months);
            var monthlyRate = apr / 100 / 12;
            var balance = principal;
            var totalInterest = 0;
            var totalPaid = 0;
            var elapsedMonths = 0;
            var timeline = [];

            while (balance > 0.01 && elapsedMonths < 6000) {
                var interestPart = monthlyRate === 0 ? 0 : balance * monthlyRate;
                var paymentThisMonth = payment + Math.max(0, extraMonthlyPayment);
                var principalPart = paymentThisMonth - interestPart;

                if (principalPart <= 0) {
                    break;
                }

                if (principalPart > balance) {
                    principalPart = balance;
                    paymentThisMonth = principalPart + interestPart;
                }

                balance = Math.max(0, balance - principalPart);
                totalInterest += interestPart;
                totalPaid += paymentThisMonth;
                elapsedMonths += 1;
                timeline.push({
                    month: elapsedMonths,
                    balance: balance
                });
            }

            return {
                basePayment: payment,
                totalInterest: totalInterest,
                totalPaid: totalPaid,
                months: elapsedMonths,
                timeline: timeline
            };
        }

        function classifyDti(dtiRatio) {
            if (dtiRatio < 0.3) {
                return { label: "Safe", css: "risk-safe" };
            }
            if (dtiRatio <= 0.4) {
                return { label: "Moderate", css: "risk-moderate" };
            }
            return { label: "High risk", css: "risk-high" };
        }

        function computeHealthScore(dtiRatio, loanVsIncome, interestBurden, cashflowRatio) {
            var score = 100;

            if (dtiRatio > 0.4) {
                score -= 35;
            } else if (dtiRatio > 0.3) {
                score -= 20;
            } else if (dtiRatio > 0.2) {
                score -= 8;
            }

            if (loanVsIncome > 1) {
                score -= 20;
            } else if (loanVsIncome > 0.7) {
                score -= 12;
            } else if (loanVsIncome > 0.4) {
                score -= 6;
            }

            if (interestBurden > 0.6) {
                score -= 20;
            } else if (interestBurden > 0.35) {
                score -= 12;
            } else if (interestBurden > 0.2) {
                score -= 6;
            }

            if (cashflowRatio < 0.05) {
                score -= 18;
            } else if (cashflowRatio < 0.15) {
                score -= 10;
            } else if (cashflowRatio > 0.35) {
                score += 6;
            }

            return Math.max(0, Math.min(100, Math.round(score)));
        }

        function renderPieChart(principal, totalInterest) {
            var ctx;
            var width;
            var height;
            var total;
            var principalAngle;

            if (!pieChart || !pieChart.getContext) {
                return;
            }

            ctx = pieChart.getContext("2d");
            width = pieChart.width;
            height = pieChart.height;
            total = Math.max(1, principal + totalInterest);
            principalAngle = (principal / total) * Math.PI * 2;
            var chartBackground = isLightTheme() ? "rgba(247,251,255,0.98)" : "rgba(11, 19, 32, 1)";
            var labelColor = isLightTheme() ? "#2a3f5f" : "#d2dceb";

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = chartBackground;
            ctx.fillRect(0, 0, width, height);

            ctx.beginPath();
            ctx.moveTo(width / 2, height / 2);
            ctx.arc(width / 2, height / 2, 84, -Math.PI / 2, -Math.PI / 2 + principalAngle);
            ctx.closePath();
            ctx.fillStyle = "#2e8cff";
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(width / 2, height / 2);
            ctx.arc(width / 2, height / 2, 84, -Math.PI / 2 + principalAngle, -Math.PI / 2 + Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = "#f59e0b";
            ctx.fill();

            ctx.fillStyle = labelColor;
            ctx.font = "600 13px Manrope";
            ctx.fillText("Principal", 16, height - 36);
            ctx.fillText("Interest", 16, height - 16);
            ctx.fillStyle = "#2e8cff";
            ctx.fillRect(92, height - 45, 10, 10);
            ctx.fillStyle = "#f59e0b";
            ctx.fillRect(92, height - 25, 10, 10);
        }

        function renderPayoffChart(baseTimeline, extraTimeline) {
            var ctx;
            var width;
            var height;
            var leftPad = 36;
            var rightPad = 10;
            var topPad = 10;
            var bottomPad = 24;
            var xSpan;
            var ySpan;
            var maxMonths;
            var maxBalance;
            var chartBackground;
            var axisColor;

            if (!payoffChart || !payoffChart.getContext) {
                return;
            }

            ctx = payoffChart.getContext("2d");
            width = payoffChart.width;
            height = payoffChart.height;
            xSpan = width - leftPad - rightPad;
            ySpan = height - topPad - bottomPad;
            maxMonths = Math.max(1, baseTimeline.length, extraTimeline.length);
            maxBalance = Math.max(
                1,
                baseTimeline.reduce(function (maxValue, row) { return Math.max(maxValue, row.balance); }, 0),
                extraTimeline.reduce(function (maxValue, row) { return Math.max(maxValue, row.balance); }, 0)
            );
            chartBackground = isLightTheme() ? "rgba(247,251,255,0.98)" : "rgba(11, 19, 32, 1)";
            axisColor = isLightTheme() ? "rgba(90,116,153,0.35)" : "rgba(147,176,217,0.25)";

            function drawLine(timeline, color) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                timeline.forEach(function (row, index) {
                    var x = leftPad + (index / Math.max(1, maxMonths - 1)) * xSpan;
                    var y = height - bottomPad - (row.balance / maxBalance) * ySpan;
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                if (!timeline.length) {
                    ctx.moveTo(leftPad, height - bottomPad);
                    ctx.lineTo(width - rightPad, height - bottomPad);
                }
                ctx.stroke();
            }

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = chartBackground;
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = axisColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(leftPad, topPad);
            ctx.lineTo(leftPad, height - bottomPad);
            ctx.lineTo(width - rightPad, height - bottomPad);
            ctx.stroke();

            drawLine(baseTimeline, "#2e8cff");
            drawLine(extraTimeline, "#3de0c5");
        }

        function setStressRiskClass(riskResult) {
            stressRiskOutput.textContent = riskResult.label;
            stressBadgeOutput.textContent = riskResult.label;
            stressBadgeOutput.className = "risk-badge " + riskResult.css;
            if (stressMeter) {
                var targetLevel = "high";
                if (riskResult.label === "Safe") {
                    targetLevel = "safe";
                } else if (riskResult.label === "Moderate") {
                    targetLevel = "moderate";
                }

                Array.prototype.slice.call(stressMeter.querySelectorAll("[data-stress-level]")).forEach(function (node) {
                    node.classList.toggle("active", node.getAttribute("data-stress-level") === targetLevel);
                });
            }
        }

        function updateBorrowingPower() {
            var income = Number(bpIncomeInput.value);
            var expenses = Number(bpExpensesInput.value);
            var debt = Number(bpDebtInput.value);
            var rate = Number(bpRateInput.value);
            var term = Number(bpTermInput.value);
            var safePayment = Math.max(0, income * 0.4 - expenses - debt);
            var monthlyRate = rate / 100 / 12;
            var principal = 0;

            if (safePayment > 0 && term > 0) {
                if (monthlyRate === 0) {
                    principal = safePayment * term;
                } else {
                    principal = safePayment * ((1 - Math.pow(1 + monthlyRate, -term)) / monthlyRate);
                }
            }

            borrowingOutput.textContent = formatCad(Math.max(0, principal), 0);
            borrowingPaymentOutput.textContent = formatCad(Math.max(0, safePayment), 0);
        }

        function updateDebtConsolidation() {
            var balance1 = Number(debt1BalanceInput.value);
            var rate1 = Number(debt1RateInput.value);
            var balance2 = Number(debt2BalanceInput.value);
            var rate2 = Number(debt2RateInput.value);
            var balance3 = Number(debt3BalanceInput.value);
            var rate3 = Number(debt3RateInput.value);
            var currentTerm = Number(currentDebtTermInput.value);
            var consolidatedRate = Number(consolidatedRateInput.value);
            var consolidatedTerm = Number(consolidatedTermInput.value);
            var totalBalance = Math.max(0, balance1 + balance2 + balance3);
            var currentPayment =
                getBasePayment(Math.max(0, balance1), Math.max(0, rate1), currentTerm) +
                getBasePayment(Math.max(0, balance2), Math.max(0, rate2), currentTerm) +
                getBasePayment(Math.max(0, balance3), Math.max(0, rate3), currentTerm);
            var consolidatedPayment = getBasePayment(totalBalance, Math.max(0, consolidatedRate), consolidatedTerm);
            var savings = currentPayment - consolidatedPayment;

            currentDebtPaymentOutput.textContent = formatCad(currentPayment);
            consolidatedPaymentOutput.textContent = formatCad(consolidatedPayment);
            consolidationSavingsOutput.textContent = formatCad(savings);
            consolidationSavingsOutput.style.color = savings >= 0 ? "#3de0c5" : "#ff6b6b";
        }

        function recalculate() {
            var principal = Number(amountInput.value);
            var apr = Number(rateInput.value);
            var termMonths = Number(termInput.value);
            var extraMonthlyPayment = Math.max(0, Number(extraInput.value));
            var income = Number(incomeInput.value);
            var livingExpenses = Number(expensesInput.value);
            var existingDebt = Number(existingDebtInput.value);
            var startDate = parseMonthInput(startMonthInput.value);
            var rateIncrease = Math.max(0, Number(rateIncreaseInput.value));
            var incomeDrop = Math.max(0, Number(incomeDropInput.value));
            var unexpectedExpense = Math.max(0, Number(unexpectedExpenseInput.value));
            var baseSchedule;
            var extraSchedule;
            var baseDti;
            var dtiClassification;
            var stressRatio;
            var shockIncome;
            var shockRate;
            var shockSchedule;
            var shockDti;
            var loanVsIncome;
            var interestBurden;
            var cashflowRatio;
            var healthScore;
            var strengths = [];
            var concerns = [];
            var recommendations = [];
            var payoffBase;
            var payoffExtra;
            var meterWidth;

            if (
                !Number.isFinite(principal) || principal < 0 ||
                !Number.isFinite(apr) || apr < 0 ||
                !Number.isFinite(termMonths) || termMonths <= 0 ||
                !Number.isFinite(income) || income <= 0 ||
                !Number.isFinite(livingExpenses) || livingExpenses < 0 ||
                !Number.isFinite(existingDebt) || existingDebt < 0 ||
                !startDate
            ) {
                return;
            }

            baseSchedule = runAmortization(principal, apr, termMonths, 0);
            extraSchedule = runAmortization(principal, apr, termMonths, extraMonthlyPayment);

            payoffBase = new Date(startDate.getFullYear(), startDate.getMonth() + Math.max(0, baseSchedule.months - 1), 1);
            payoffExtra = new Date(startDate.getFullYear(), startDate.getMonth() + Math.max(0, extraSchedule.months - 1), 1);
            baseDti = (existingDebt + baseSchedule.basePayment) / Math.max(1, income);
            dtiClassification = classifyDti(baseDti);

            monthlyOutput.textContent = formatCad(baseSchedule.basePayment);
            repaymentOutput.textContent = formatCad(baseSchedule.totalPaid);
            interestOutput.textContent = formatCad(baseSchedule.totalInterest);
            payoffOutput.textContent = monthLabel(payoffBase);
            extraPayoffOutput.textContent = monthLabel(payoffExtra);
            interestSavedOutput.textContent = formatCad(Math.max(0, baseSchedule.totalInterest - extraSchedule.totalInterest));
            monthsReducedOutput.textContent = String(Math.max(0, baseSchedule.months - extraSchedule.months));
            dtiOutput.textContent = formatPercent(baseDti * 100);
            dtiClassOutput.textContent = dtiClassification.label;
            meterWidth = Math.max(0, Math.min(100, baseDti * 100));
            dtiMeterFill.style.width = String(meterWidth) + "%";

            stressRatio = (baseSchedule.basePayment + livingExpenses) / Math.max(1, income);
            setStressRiskClass(classifyDti(stressRatio));

            shockRate = apr + rateIncrease;
            shockIncome = Math.max(1, income - incomeDrop);
            shockSchedule = runAmortization(principal, shockRate, termMonths, 0);
            shockDti = (existingDebt + shockSchedule.basePayment) / shockIncome;
            shockPaymentOutput.textContent = formatCad(shockSchedule.basePayment);
            shockDtiOutput.textContent = formatPercent(shockDti * 100);

            loanVsIncome = principal / Math.max(1, income * 12);
            interestBurden = baseSchedule.totalInterest / Math.max(1, principal);
            cashflowRatio = (income - livingExpenses - existingDebt - baseSchedule.basePayment - unexpectedExpense) / Math.max(1, income);
            healthScore = computeHealthScore(shockDti, loanVsIncome, interestBurden, cashflowRatio);
            healthScoreOutput.textContent = String(healthScore) + " / 100";

            if (shockDti < 0.3) {
                strengths.push("debt-to-income remains in the safe range");
            }
            if (loanVsIncome <= 0.45) {
                strengths.push("loan size is proportionate to annual income");
            }
            if (interestBurden <= 0.25) {
                strengths.push("interest burden is comparatively controlled");
            }
            if (strengths.length === 0) {
                strengths.push("scenario remains serviceable with baseline assumptions");
            }

            if (shockDti > 0.4) {
                concerns.push("debt-to-income moves above high-risk threshold");
            }
            if (cashflowRatio < 0.1) {
                concerns.push("post-payment monthly cash buffer is thin");
            }
            if (interestBurden > 0.35) {
                concerns.push("interest cost is a large share of the loan");
            }
            if (concerns.length === 0) {
                concerns.push("no major stress flags under current assumptions");
            }

            if (shockDti > 0.4) {
                recommendations.push("reduce principal or extend term to lower required payment");
            }
            if (interestBurden > 0.35) {
                recommendations.push("compare lower-rate lenders or refinancing options");
            }
            if (cashflowRatio < 0.15) {
                recommendations.push("increase monthly buffer before taking on the full amount");
            }
            if (recommendations.length === 0) {
                recommendations.push("current scenario is balanced; continue testing adverse shocks");
            }

            strengthsOutput.textContent = strengths.join(" | ");
            concernsOutput.textContent = concerns.join(" | ");
            recommendationsOutput.textContent = recommendations.join(" | ");

            renderPieChart(principal, baseSchedule.totalInterest);
            renderPayoffChart(baseSchedule.timeline, extraSchedule.timeline);
            updateBorrowingPower();
            updateDebtConsolidation();
        }

        if (!startMonthInput.value) {
            startMonthInput.value = new Date().toISOString().slice(0, 7);
        }

        [form, borrowingForm, consolidationForm].forEach(function (targetForm) {
            targetForm.addEventListener("submit", function (event) {
                event.preventDefault();
                recalculate();
            });
        });

        [
            amountInput,
            rateInput,
            termInput,
            startMonthInput,
            extraInput,
            incomeInput,
            expensesInput,
            existingDebtInput,
            rateIncreaseInput,
            incomeDropInput,
            unexpectedExpenseInput,
            bpIncomeInput,
            bpExpensesInput,
            bpDebtInput,
            bpRateInput,
            bpTermInput,
            debt1BalanceInput,
            debt1RateInput,
            debt2BalanceInput,
            debt2RateInput,
            debt3BalanceInput,
            debt3RateInput,
            currentDebtTermInput,
            consolidatedRateInput,
            consolidatedTermInput
        ].forEach(function (input) {
            input.addEventListener("input", recalculate);
            input.addEventListener("change", recalculate);
        });

        recalculate();
    }

    function initLoanTimelinePage() {
        var form = document.getElementById("timelineForm");
        var amountInput = document.getElementById("tlAmount");
        var rateInput = document.getElementById("tlRate");
        var termInput = document.getElementById("tlTerm");
        var incomeInput = document.getElementById("tlIncome");
        var debtInput = document.getElementById("tlDebt");
        var trendGridNode = document.getElementById("tlTrendGrid");
        var principalPath = document.getElementById("tlLinePrincipal");
        var interestPath = document.getElementById("tlLineInterest");
        var balancePath = document.getElementById("tlLineBalance");
        var railFillNode = document.getElementById("tlRailFill");
        var milestonesNode = document.getElementById("tlTimelineMilestones");
        var piePrincipalNode = document.getElementById("tlPiePrincipal");
        var pieInterestNode = document.getElementById("tlPieInterest");
        var principalPortionNode = document.getElementById("tlPrincipalPortion");
        var interestPortionNode = document.getElementById("tlInterestPortion");
        var totalRepaymentNode = document.getElementById("tlTotalRepayment");
        var interestCompareNode = document.getElementById("tlInterestCompare");
        var riskFillNode = document.getElementById("tlRiskFill");
        var riskSummaryNode = document.getElementById("tlRiskSummary");
        var riskDtiNode = document.getElementById("tlRiskDti");
        var riskLoanIncomeNode = document.getElementById("tlRiskLoanIncome");
        var riskInterestBurdenNode = document.getElementById("tlRiskInterestBurden");

        if (
            !form || !amountInput || !rateInput || !termInput || !incomeInput || !debtInput ||
            !trendGridNode || !principalPath || !interestPath || !balancePath || !railFillNode ||
            !milestonesNode || !piePrincipalNode || !pieInterestNode || !principalPortionNode ||
            !interestPortionNode || !totalRepaymentNode || !interestCompareNode || !riskFillNode ||
            !riskSummaryNode || !riskDtiNode || !riskLoanIncomeNode || !riskInterestBurdenNode
        ) {
            return;
        }

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function toPercent(value) {
            return (Math.round(value * 1000) / 10).toFixed(1) + "%";
        }

        function amortizeLoan(principal, apr, months) {
            var monthly = calculateMonthlyInstallment(principal, apr, months);
            var monthlyRate = apr / 1200;
            var balance = principal;
            var rows = [];
            var month;
            var totalInterest = 0;

            for (month = 1; month <= months; month += 1) {
                var interest = monthlyRate > 0 ? balance * monthlyRate : 0;
                var principalPaid = Math.max(0, monthly - interest);

                if (principalPaid > balance) {
                    principalPaid = balance;
                }

                totalInterest += interest;
                balance = Math.max(0, balance - principalPaid);
                rows.push({
                    month: month,
                    principalPaid: principalPaid,
                    interestPaid: interest,
                    balance: balance
                });

                if (balance <= 0.01) {
                    break;
                }
            }

            return {
                monthly: monthly,
                totalInterest: totalInterest,
                totalRepayment: principal + totalInterest,
                rows: rows
            };
        }

        function makeLinePath(rows, getter, maxY) {
            var width = 820;
            var height = 320;
            var leftPad = 42;
            var rightPad = 14;
            var topPad = 16;
            var bottomPad = 22;
            var xSpan = width - leftPad - rightPad;
            var ySpan = height - topPad - bottomPad;
            var stepX = rows.length > 1 ? xSpan / (rows.length - 1) : 0;
            var d = "";

            rows.forEach(function (row, index) {
                var x = leftPad + index * stepX;
                var y = height - bottomPad - (getter(row) / maxY) * ySpan;
                d += (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
            });

            return d.trim();
        }

        function animatePath(pathNode) {
            var length = pathNode.getTotalLength();
            pathNode.style.transition = "none";
            pathNode.style.strokeDasharray = String(length);
            pathNode.style.strokeDashoffset = String(length);
            pathNode.getBoundingClientRect();
            pathNode.style.transition = "stroke-dashoffset 640ms ease";
            pathNode.style.strokeDashoffset = "0";
        }

        function renderTrendChart(schedule) {
            var rows = schedule.rows;
            var maxY = Math.max(
                1,
                rows.reduce(function (acc, row) {
                    return Math.max(acc, row.principalPaid, row.interestPaid, row.balance);
                }, 0)
            );
            var gridHtml = "";
            var axisIndex;

            for (axisIndex = 0; axisIndex <= 4; axisIndex += 1) {
                var y = 16 + ((320 - 38) * axisIndex) / 4;
                gridHtml += '<line x1="42" y1="' + String(y.toFixed(2)) + '" x2="806" y2="' + String(y.toFixed(2)) + '" class="tl-grid-line"></line>';
            }

            trendGridNode.innerHTML = gridHtml;
            principalPath.setAttribute("d", makeLinePath(rows, function (row) { return row.principalPaid; }, maxY));
            interestPath.setAttribute("d", makeLinePath(rows, function (row) { return row.interestPaid; }, maxY));
            balancePath.setAttribute("d", makeLinePath(rows, function (row) { return row.balance; }, maxY));

            animatePath(principalPath);
            animatePath(interestPath);
            animatePath(balancePath);
        }

        function renderPayoffTimeline(schedule, principal) {
            var maxMonth = schedule.rows.length;
            var rawCheckpoints = [1, Math.ceil(maxMonth / 3), Math.ceil((maxMonth * 2) / 3), maxMonth];
            var checkpoints = [];

            milestonesNode.innerHTML = "";
            rawCheckpoints.forEach(function (month) {
                var safeMonth = clamp(month, 1, maxMonth);
                if (checkpoints.indexOf(safeMonth) === -1) {
                    checkpoints.push(safeMonth);
                }
            });

            checkpoints.forEach(function (month, index) {
                var row = schedule.rows[Math.max(0, month - 1)];
                var balance = row ? row.balance : 0;
                var paidRatio = 1 - balance / Math.max(1, principal);
                var item = document.createElement("div");

                item.className = "tl-milestone";
                item.style.animationDelay = String(index * 80) + "ms";
                item.innerHTML =
                    '<p class="tl-milestone-label">Month ' + String(month) + " \u2192 balance " + formatCad(balance, 0) + "</p>" +
                    '<div class="tl-milestone-track"><i style="width:' + String((paidRatio * 100).toFixed(2)) + '%"></i></div>';
                milestonesNode.appendChild(item);
            });

            railFillNode.classList.remove("is-active");
            railFillNode.getBoundingClientRect();
            railFillNode.classList.add("is-active");
        }

        function renderBreakdownPie(schedule, principal) {
            var circumference = 2 * Math.PI * 68;
            var principalShare = clamp(principal / Math.max(1, schedule.totalRepayment), 0, 1);
            var principalLength = circumference * principalShare;
            var interestLength = circumference - principalLength;

            piePrincipalNode.style.strokeDasharray = principalLength.toFixed(2) + " " + circumference.toFixed(2);
            piePrincipalNode.style.strokeDashoffset = "0";
            pieInterestNode.style.strokeDasharray = interestLength.toFixed(2) + " " + circumference.toFixed(2);
            pieInterestNode.style.strokeDashoffset = (-principalLength).toFixed(2);
            principalPortionNode.textContent = formatCad(principal, 0);
            interestPortionNode.textContent = formatCad(schedule.totalInterest, 0);
            totalRepaymentNode.textContent = formatCad(schedule.totalRepayment, 0);
        }

        function renderInterestComparison(principal, rate) {
            var terms = [24, 36, 48];
            var results = terms.map(function (term) {
                var monthly = calculateMonthlyInstallment(principal, rate, term);
                var interest = monthly * term - principal;
                return { term: term, interest: Math.max(0, interest) };
            });
            var maxInterest = Math.max.apply(
                null,
                results.map(function (row) {
                    return row.interest;
                })
            ) || 1;

            interestCompareNode.innerHTML = "";
            results.forEach(function (result) {
                var width = (result.interest / maxInterest) * 100;
                var row = document.createElement("div");

                row.className = "tl-interest-row";
                row.innerHTML =
                    '<p><span>' + String(result.term) + " month loan</span><strong>" + formatCad(result.interest, 0) + "</strong></p>" +
                    '<div class="tl-interest-track"><i style="width:' + String(width.toFixed(2)) + '%"></i></div>';
                interestCompareNode.appendChild(row);
            });
        }

        function renderRiskIndicator(principal, monthlyPayment, totalInterest, income, otherDebt) {
            var dtiRatio = (monthlyPayment + otherDebt) / Math.max(1, income);
            var loanVsIncome = principal / Math.max(1, income * 12);
            var interestBurden = totalInterest / Math.max(1, principal);
            var dtiFactor = clamp(dtiRatio / 0.45, 0, 1);
            var loanFactor = clamp(loanVsIncome / 0.85, 0, 1);
            var interestFactor = clamp(interestBurden / 0.65, 0, 1);
            var score = Math.round((dtiFactor * 0.45 + loanFactor * 0.3 + interestFactor * 0.25) * 100);
            var label = "Safe";
            var cssClass = "risk-safe";

            if (score >= 65) {
                label = "High Risk";
                cssClass = "risk-high";
            } else if (score >= 35) {
                label = "Moderate";
                cssClass = "risk-moderate";
            }

            riskFillNode.style.width = String(score) + "%";
            riskFillNode.className = "tl-risk-fill " + cssClass;
            riskSummaryNode.textContent = "Risk score: " + String(score) + " (" + label + ")";
            riskDtiNode.textContent = toPercent(dtiRatio);
            riskLoanIncomeNode.textContent = toPercent(loanVsIncome);
            riskInterestBurdenNode.textContent = toPercent(interestBurden);
        }

        function recalculate() {
            var amount = Math.max(1, Number(amountInput.value));
            var rate = clamp(Number(rateInput.value), 0, 60);
            var term = Math.max(1, Math.round(Number(termInput.value)));
            var income = Math.max(1, Number(incomeInput.value));
            var otherDebt = Math.max(0, Number(debtInput.value));
            var schedule = amortizeLoan(amount, rate, term);

            if (!schedule.rows.length) {
                return;
            }

            renderTrendChart(schedule);
            renderPayoffTimeline(schedule, amount);
            renderBreakdownPie(schedule, amount);
            renderInterestComparison(amount, rate);
            renderRiskIndicator(amount, schedule.monthly, schedule.totalInterest, income, otherDebt);
        }

        [amountInput, rateInput, termInput, incomeInput, debtInput].forEach(function (input) {
            input.addEventListener("input", recalculate);
            input.addEventListener("change", recalculate);
        });
        recalculate();
    }

    function initRefinancePage() {
        var form = document.getElementById("refiForm");
        var balanceInput = document.getElementById("rfBalance");
        var currentRateInput = document.getElementById("rfCurrentRate");
        var newRateInput = document.getElementById("rfNewRate");
        var termInput = document.getElementById("rfTerm");
        var feesInput = document.getElementById("rfFees");
        var monthlySavingsOutput = document.getElementById("rfMonthlySavings");
        var totalSavedOutput = document.getElementById("rfTotalSaved");
        var breakEvenOutput = document.getElementById("rfBreakEven");
        var recommendationOutput = document.getElementById("rfRecommendation");

        if (
            !form || !balanceInput || !currentRateInput || !newRateInput || !termInput || !feesInput ||
            !monthlySavingsOutput || !totalSavedOutput || !breakEvenOutput || !recommendationOutput
        ) {
            return;
        }

        function recalculate() {
            var balance = Number(balanceInput.value);
            var currentRate = Number(currentRateInput.value);
            var newRate = Number(newRateInput.value);
            var term = Number(termInput.value);
            var fees = Number(feesInput.value);
            var currentMonthly = calculateMonthlyInstallment(balance, currentRate, term);
            var newMonthly = calculateMonthlyInstallment(balance, newRate, term);
            var monthlySavings = currentMonthly - newMonthly;
            var totalSavings = monthlySavings * term - fees;
            var breakEven = monthlySavings > 0 ? Math.ceil(fees / monthlySavings) : 0;

            monthlySavingsOutput.textContent = formatCad(monthlySavings);
            totalSavedOutput.textContent = formatCad(totalSavings, 0);
            breakEvenOutput.textContent = breakEven > 0 ? String(breakEven) + " months" : "N/A";
            recommendationOutput.textContent =
                totalSavings > 0 && breakEven <= term ? "Refinance looks favorable" : "Keep current loan terms";
        }

        form.addEventListener("input", recalculate);
        window.addEventListener("themechange", recalculate);
        recalculate();
    }

    function initHomeAdvancedLoanModules() {
        var stressOutput = document.getElementById("loanStressScore");
        var stressDtiOutput = document.getElementById("stressDti");
        var stressRecommendationOutput = document.getElementById("stressRecommendation");
        var safeMeter = document.getElementById("stressSafeMeter");
        var riskyMeter = document.getElementById("stressRiskyMeter");
        var expensesInput = document.getElementById("monthlyExpenses");
        var incomeInput = document.getElementById("monthlyIncome");
        var debtInput = document.getElementById("existingDebt");
        var loanAmountInput = document.getElementById("loanAmount");
        var aprInput = document.getElementById("apr");
        var termInput = document.getElementById("termYears");
        var shockRateInput = document.getElementById("shockRateRise");
        var shockIncomeInput = document.getElementById("shockIncomeDrop");
        var shockExpenseInput = document.getElementById("shockExpenseAdd");
        var shockMonthlyOutput = document.getElementById("shockMonthly");
        var shockDtiOutput = document.getElementById("shockDti");
        var healthScoreOutput = document.getElementById("financialHealthScore");
        var healthStrengthsOutput = document.getElementById("healthStrengths");
        var healthConcernsOutput = document.getElementById("healthConcerns");
        var creditInput = document.getElementById("creditEstimate");
        var term24Output = document.getElementById("termCompare24");
        var term36Output = document.getElementById("termCompare36");
        var term48Output = document.getElementById("termCompare48");
        var tableOutputs = document.querySelectorAll("[data-live-payment]");

        if (
            !stressOutput || !stressDtiOutput || !stressRecommendationOutput || !safeMeter || !riskyMeter ||
            !incomeInput || !debtInput || !loanAmountInput || !aprInput || !termInput || !expensesInput
        ) {
            return;
        }

        function renderMeter(fill) {
            var safeBlocks = Math.max(1, Math.min(10, Math.round(fill / 10)));
            var riskyBlocks = Math.max(1, 10 - safeBlocks);
            safeMeter.textContent = "SAFE  " + "█".repeat(safeBlocks) + "░".repeat(10 - safeBlocks);
            riskyMeter.textContent = "RISKY " + "█".repeat(riskyBlocks) + "░".repeat(10 - riskyBlocks);
        }

        function updateStressAndHealth() {
            var amount = Number(loanAmountInput.value);
            var apr = Number(aprInput.value);
            var termYears = Number(termInput.value);
            var termMonths = Math.round(termYears * 12);
            var income = Number(incomeInput.value);
            var expenses = Number(expensesInput.value);
            var debts = Number(debtInput.value);
            var monthly = calculateMonthlyInstallment(amount, apr, termMonths);
            var dtiRatio = income > 0 ? (debts + expenses + monthly) / income : 0;
            var riskScore = 100;
            var recommendationAmount = 0;
            var credit = creditInput ? creditInput.value : "good";
            var strengths = [];
            var concerns = [];

            riskScore -= Math.max(0, (dtiRatio - 0.3) * 120);
            riskScore -= apr > 20 ? 12 : apr > 14 ? 6 : 0;
            riskScore -= amount > 15000 ? 8 : 0;
            riskScore += credit === "excellent" ? 8 : credit === "good" ? 4 : credit === "fair" ? -6 : -14;
            riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

            if (dtiRatio <= 0.36) {
                stressOutput.textContent = "Low Risk";
            } else if (dtiRatio <= 0.5) {
                stressOutput.textContent = "Moderate Risk";
            } else {
                stressOutput.textContent = "High Risk";
            }

            if (dtiRatio > 0.36) {
                recommendationAmount = Math.max(0, Math.round((amount * (dtiRatio - 0.36) * 0.8) / 100) * 100);
            }

            stressDtiOutput.textContent = String(Math.round(dtiRatio * 100)) + "%";
            stressRecommendationOutput.textContent = recommendationAmount > 0
                ? "Lower loan amount by " + formatCad(recommendationAmount, 0)
                : "Current loan amount looks sustainable";
            renderMeter(riskScore);

            if (income >= 4000) {
                strengths.push("steady income");
            }
            if (dtiRatio < 0.4) {
                strengths.push("manageable debt load");
            }
            if (credit === "excellent" || credit === "good") {
                strengths.push("credit profile supports better pricing");
            }

            if (debts > 900) {
                concerns.push("existing debt is elevated");
            }
            if (apr > 18) {
                concerns.push("high APR increases total repayment");
            }
            if (expenses > income * 0.45) {
                concerns.push("monthly expenses are high vs income");
            }

            if (healthScoreOutput) {
                healthScoreOutput.textContent = String(riskScore) + " / 100";
            }
            if (healthStrengthsOutput) {
                healthStrengthsOutput.textContent = strengths.length > 0 ? "✔ " + strengths.join(" • ") : "✔ income profile being evaluated";
            }
            if (healthConcernsOutput) {
                healthConcernsOutput.textContent = concerns.length > 0 ? "⚠ " + concerns.join(" • ") : "⚠ no major concerns flagged";
            }

            if (shockMonthlyOutput || shockDtiOutput) {
                var shockRate = shockRateInput ? Number(shockRateInput.value) : 3;
                var shockIncome = shockIncomeInput ? Number(shockIncomeInput.value) : 400;
                var shockExpense = shockExpenseInput ? Number(shockExpenseInput.value) : 250;
                var shockMonthly = calculateMonthlyInstallment(amount, apr + shockRate, termMonths);
                var shockIncomeNet = Math.max(1, income - shockIncome);
                var shockDti = (debts + expenses + shockExpense + shockMonthly) / shockIncomeNet;
                if (shockMonthlyOutput) {
                    shockMonthlyOutput.textContent = formatCad(shockMonthly);
                }
                if (shockDtiOutput) {
                    shockDtiOutput.textContent = String(Math.round(shockDti * 100)) + "%";
                }
            }

            if (term24Output && term36Output && term48Output) {
                term24Output.textContent = formatCad(calculateMonthlyInstallment(5000, apr, 24));
                term36Output.textContent = formatCad(calculateMonthlyInstallment(5000, apr, 36));
                term48Output.textContent = formatCad(calculateMonthlyInstallment(5000, apr, 48));
            }

            if (tableOutputs.length) {
                tableOutputs.forEach(function (node) {
                    var loan = Number(node.getAttribute("data-live-payment"));
                    var payment = calculateMonthlyInstallment(loan, apr, termMonths);
                    node.textContent = formatCad(payment);
                });
            }
        }

        [
            loanAmountInput, aprInput, termInput, incomeInput, expensesInput, debtInput, creditInput,
            shockRateInput, shockIncomeInput, shockExpenseInput
        ].filter(Boolean).forEach(function (input) {
            input.addEventListener("input", updateStressAndHealth);
            input.addEventListener("change", updateStressAndHealth);
        });

        updateStressAndHealth();
    }

    function initPaymentLookupPage() {
        var tableBody = document.getElementById("lookupRows");
        var amounts = [2000, 5000, 10000, 15000, 20000, 25000, 30000, 40000];

        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = "";

        amounts.forEach(function (amount) {
            var payment3 = calculateMonthlyInstallment(amount, 11, 36);
            var payment5 = calculateMonthlyInstallment(amount, 11, 60);
            var row = document.createElement("tr");

            row.innerHTML =
                "<td>" + formatCad(amount, 0) + "</td>" +
                "<td>" + formatCad(payment3, 0) + "</td>" +
                "<td>" + formatCad(payment5, 0) + "</td>";

            tableBody.appendChild(row);
        });
    }

    function initLoanExamplesPage() {
        var container = document.getElementById("exampleLibrary");
        var amounts = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
        var terms = [12, 24];
        var rate = 12;

        if (!container) {
            return;
        }

        container.innerHTML = "";

        amounts.forEach(function (amount) {
            terms.forEach(function (term) {
                var monthly = calculateMonthlyInstallment(amount, rate, term);
                var total = monthly * term;
                var interest = total - amount;
                var card = document.createElement("article");

                card.className = "card";
                card.innerHTML =
                    "<h3>Example: " + formatCad(amount, 0) + " loan</h3>" +
                    "<p>Interest rate: " + String(rate) + "%</p>" +
                    "<p>Term: " + String(term) + " months</p>" +
                    "<p>Monthly payment: " + formatCad(monthly, 0) + "</p>" +
                    "<p>Total interest: " + formatCad(interest, 0) + "</p>";

                container.appendChild(card);
            });
        });
    }

    function initLoanMapPage() {
        var provinceButtons = document.getElementById("provinceButtons");
        var provinceOutput = document.getElementById("pmProvince");
        var ratesOutput = document.getElementById("pmRates");
        var termOutput = document.getElementById("pmTerm");
        var exampleOutput = document.getElementById("pmExample");
        var data = [
            { id: "BC", name: "British Columbia", minRate: 10, maxRate: 24, term: "12-72 months" },
            { id: "AB", name: "Alberta", minRate: 9, maxRate: 23, term: "12-72 months" },
            { id: "SK", name: "Saskatchewan", minRate: 10, maxRate: 25, term: "12-60 months" },
            { id: "MB", name: "Manitoba", minRate: 10, maxRate: 25, term: "12-60 months" },
            { id: "ON", name: "Ontario", minRate: 9, maxRate: 24, term: "12-84 months" },
            { id: "QC", name: "Quebec", minRate: 8, maxRate: 22, term: "12-84 months" },
            { id: "NB", name: "New Brunswick", minRate: 11, maxRate: 27, term: "12-60 months" },
            { id: "NS", name: "Nova Scotia", minRate: 11, maxRate: 27, term: "12-60 months" },
            { id: "PE", name: "Prince Edward Island", minRate: 11, maxRate: 27, term: "12-60 months" },
            { id: "NL", name: "Newfoundland and Labrador", minRate: 11, maxRate: 28, term: "12-60 months" }
        ];

        if (!provinceButtons || !provinceOutput || !ratesOutput || !termOutput || !exampleOutput) {
            return;
        }

        function renderProvince(item) {
            var apr = (item.minRate + item.maxRate) / 2;
            var monthly = calculateMonthlyInstallment(5000, apr, 36);

            provinceOutput.textContent = item.name;
            ratesOutput.textContent = "Rate range: " + String(item.minRate) + "%-" + String(item.maxRate) + "%";
            termOutput.textContent = "Typical term: " + item.term;
            exampleOutput.textContent = "Sample payment: " + formatCad(monthly, 0) + " on a $5,000 / 36-month scenario";
        }

        provinceButtons.innerHTML = "";

        data.forEach(function (item, index) {
            var button = document.createElement("button");

            button.type = "button";
            button.className = "province-btn";
            button.textContent = item.id;
            button.addEventListener("click", function () {
                renderProvince(item);
            });
            provinceButtons.appendChild(button);

            if (index === 0) {
                renderProvince(item);
            }
        });
    }

    function initFaqPage() {
        var list = document.getElementById("faqList");
        var questions = [
            "Can I get a loan without credit?", "How long do loan approvals take?", "What affects loan interest rates?",
            "Can I pay off a loan early?", "What happens if I miss a payment?", "Do lenders check income stability?",
            "What is a good debt-to-income ratio?", "How much can I borrow on a $4,000 income?",
            "Are fixed rates better than variable rates?", "Can I refinance with bad credit?",
            "Does a shorter term always save money?", "Can I apply if self-employed?", "What documents are required?",
            "Can I have multiple personal loans?", "How is APR different from interest rate?",
            "What is the fastest way to improve approval odds?", "Do extra payments reduce term length?",
            "Are there penalties for early repayment?", "How does province affect loan options?",
            "Is payday borrowing cheaper than installment loans?", "How do lenders verify employment?",
            "Can I change my payment date?", "What loan size is considered small?", "What term is best for emergencies?",
            "How do I compare lenders fairly?", "Can I qualify after bankruptcy?", "Will a co-applicant lower my rate?",
            "Can I borrow for debt consolidation?", "What is a high-risk loan profile?", "Do I need direct deposit?",
            "How often can I refinance?", "What if my income changes after approval?", "Is online application secure?",
            "Can I cancel after accepting a loan?", "How do I avoid over-borrowing?", "What credit score is excellent?",
            "What score is considered fair?", "What is amortization?", "How is monthly payment calculated?",
            "What should I do before submitting an application?", "Can I get funded the same day?"
        ];

        if (!list) {
            return;
        }

        list.innerHTML = "";
        questions.forEach(function (question) {
            var item = document.createElement("article");

            item.className = "faq-item card";
            item.innerHTML =
                "<h3>" + question + "</h3>" +
                "<p>Use the calculators in this toolkit to model your exact case, compare costs, and confirm affordability before applying.</p>";
            list.appendChild(item);
        });
    }

    function initConversionScaffolding() {
        var main = document.querySelector("main");
        var hero = main ? main.querySelector(".hero") : null;
        var heroContainer = hero ? hero.querySelector(".container") : null;
        var funnelStrip = document.querySelector(".conversion-funnel");
        var trustStrip = document.querySelector(".trust-strip");
        var timelineStrip = document.querySelector(".how-it-works-strip");
        var primaryCta = document.querySelector(".btn.btn-primary");
        var sticky = document.querySelector(".sticky-cta");

        function trustMarkup() {
            return (
                '<div class="container trust-grid">' +
                '  <p class="trust-item">Secure calculations</p>' +
                '  <p class="trust-item">No credit check for estimates</p>' +
                '  <p class="trust-item">Serving all Canadian provinces</p>' +
                '  <p class="trust-item">Fast approval timelines</p>' +
                "</div>" +
                '<div class="container social-proof-wrap">' +
                '  <p id="socialProofCounter" class="social-proof-text"><span data-daily-checks-count>42</span> Canadians checked loan options today</p>' +
                "</div>"
            );
        }

        function timelineMarkup() {
            return (
                '<div class="container">' +
                "  <h2>Application Timeline</h2>" +
                '  <div class="steps-grid">' +
                '    <article class="step-card"><span class="step-icon" aria-hidden="true">&#x1F4CA;</span> Estimate loan</article>' +
                '    <article class="step-card"><span class="step-icon" aria-hidden="true">&#x2696;</span> Compare scenarios</article>' +
                '    <article class="step-card"><span class="step-icon" aria-hidden="true">&#x1F512;</span> Apply securely</article>' +
                '    <article class="step-card"><span class="step-icon" aria-hidden="true">&#x1F4B8;</span> Receive funds</article>' +
                "  </div>" +
                "</div>"
            );
        }

        if (funnelStrip) {
            funnelStrip.remove();
            funnelStrip = null;
        }

        if (hero && !trustStrip) {
            trustStrip = document.createElement("section");
            trustStrip.className = "trust-strip";
            trustStrip.setAttribute("aria-label", "Trust signals");
            hero.insertAdjacentElement("afterend", trustStrip);
        }

        if (trustStrip) {
            trustStrip.className = "trust-strip";
            trustStrip.setAttribute("aria-label", "Trust signals");
            trustStrip.innerHTML = trustMarkup();
        }

        if (hero && !timelineStrip) {
            timelineStrip = document.createElement("section");
            timelineStrip.className = "how-it-works-strip";
            timelineStrip.setAttribute("aria-label", "Application timeline");
            if (trustStrip) {
                trustStrip.insertAdjacentElement("afterend", timelineStrip);
            } else {
                hero.insertAdjacentElement("afterend", timelineStrip);
            }
        }

        if (timelineStrip) {
            timelineStrip.className = "how-it-works-strip";
            timelineStrip.setAttribute("aria-label", "Application timeline");
            timelineStrip.innerHTML = timelineMarkup();
        }

        if (heroContainer && !primaryCta) {
            var ctaGroup = document.createElement("div");
            ctaGroup.className = "cta-group";
            ctaGroup.innerHTML =
                '<a href="/loan-calculator/" class="btn btn-primary">Check Loan Options</a>' +
                '<a href="/apply/" class="btn btn-secondary">Start Application</a>';
            heroContainer.appendChild(ctaGroup);
        }

        if (!sticky) {
            sticky = document.createElement("a");
            sticky.className = "sticky-cta";
            sticky.setAttribute("href", "#calculator");
            sticky.setAttribute("data-fallback-href", "/loan-calculator/");
            document.body.appendChild(sticky);
        }

        sticky.textContent = "Check Loan Options";
    }

    function initSocialProofCounter() {
        var nodes = document.querySelectorAll("[data-daily-checks-count]");
        var liveProofMessage = document.getElementById("liveProofMessage");
        var now = new Date();
        var daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        var checksToday = 42 + (daySeed % 19);

        if (!nodes.length && !liveProofMessage) {
            return;
        }

        function renderCount(value) {
            nodes.forEach(function (node) {
                node.textContent = String(value);
            });

            document.documentElement.setAttribute("data-daily-checks", String(value));

            if (liveProofMessage) {
                liveProofMessage.textContent = String(value) + " Canadians checked loan options today";
            }
        }

        renderCount(checksToday);

        window.setInterval(function () {
            checksToday += (checksToday + daySeed) % 4 === 0 ? 2 : 1;
            renderCount(checksToday);
        }, 24000);
    }

    function initStickyCta() {
        var sticky = document.querySelector(".sticky-cta");
        var calculator = document.getElementById("calculator");

        if (!sticky) {
            return;
        }

        if (calculator) {
            sticky.setAttribute("href", "#calculator");
            return;
        }

        sticky.setAttribute("href", sticky.getAttribute("data-fallback-href") || "/loan-calculator/");
    }

    function initEstimateEmailCapture() {
        var amountInput = document.getElementById("loanAmount");
        var aprInput = document.getElementById("apr");
        var termYearsInput = document.getElementById("termYears");
        var resultsPanel = document.querySelector(".loan-results");
        var form = document.getElementById("estimateEmailForm");
        var emailInput;
        var message;
        var monthlyOutput = document.getElementById("monthlyPayment");
        var repaymentOutput = document.getElementById("totalRepayment");
        var interestOutput = document.getElementById("totalInterest");
        var payoffOutput = document.getElementById("payoffDate");

        function parseCurrency(text) {
            return Number(String(text || "").replace(/[^0-9.-]/g, ""));
        }

        if (!form && resultsPanel && amountInput && aprInput && termYearsInput && monthlyOutput && repaymentOutput && interestOutput && payoffOutput) {
            form = document.createElement("form");
            form.id = "estimateEmailForm";
            form.className = "estimate-email-form";
            form.setAttribute("aria-label", "Email loan estimate");
            form.innerHTML =
                '<label for="estimateEmail">Save this result</label>' +
                '<div class="estimate-email-controls">' +
                '  <input type="email" id="estimateEmail" autocomplete="email" placeholder="name@email.com" required>' +
                '  <button type="submit" class="btn btn-primary">Email My Loan Estimate</button>' +
                "</div>" +
                '<p id="estimateEmailMessage" class="form-message" aria-live="polite"></p>';
            resultsPanel.appendChild(form);
        }

        emailInput = document.getElementById("estimateEmail");
        message = document.getElementById("estimateEmailMessage");

        if (!form || !emailInput || !message || !amountInput || !aprInput || !termYearsInput || !monthlyOutput || !repaymentOutput || !interestOutput || !payoffOutput) {
            return;
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            var email = emailInput.value.trim();
            var estimate = {
                principal: Number(amountInput.value),
                apr: Number(aprInput.value),
                termYears: Number(termYearsInput.value),
                monthlyPayment: parseCurrency(monthlyOutput.textContent),
                totalRepayment: parseCurrency(repaymentOutput.textContent),
                totalInterest: parseCurrency(interestOutput.textContent),
                payoffLabel: String(payoffOutput.textContent || "").trim()
            };

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                message.textContent = "Enter a valid email address.";
                message.style.color = "#ff6b6b";
                return;
            }

            if (
                !Number.isFinite(estimate.principal) ||
                !Number.isFinite(estimate.apr) ||
                !Number.isFinite(estimate.termYears) ||
                !Number.isFinite(estimate.monthlyPayment) ||
                !Number.isFinite(estimate.totalRepayment) ||
                !Number.isFinite(estimate.totalInterest) ||
                !estimate.payoffLabel
            ) {
                message.textContent = "Run your estimate before sending.";
                message.style.color = "#ff6b6b";
                return;
            }

            message.textContent = "Sending estimate...";
            message.style.color = "#d2dceb";

            apiRequest("/api/loan-estimate-emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    estimate: estimate
                })
            })
                .then(function () {
                    message.textContent = "Estimate sent. Check your inbox.";
                    message.style.color = "#3de0c5";
                })
                .catch(function (error) {
                    message.textContent = error.message || "Unable to send estimate right now.";
                    message.style.color = "#ff6b6b";
                });
        });
    }

    function initPageFeatures(body) {
        initConversionScaffolding();
        initSocialProofCounter();
        initStickyCta();
        initEstimateEmailCapture();

        if (body.classList.contains("page-about")) {
            initAboutPage();
        }

        if (body.classList.contains("page-blog")) {
            initBlogPage();
        }

        if (body.classList.contains("page-brand-collab")) {
            initBrandCollabPage();
        }

        if (body.classList.contains("page-contact")) {
            initContactPage();
        }

        if (body.classList.contains("page-media-kit")) {
            initMediaKitPage();
        }

        if (body.classList.contains("page-premium")) {
            initPremiumPage();
        }

        if (body.classList.contains("page-resources")) {
            initResourcesPage();
        }

        if (body.classList.contains("page-starter-plan")) {
            initStarterPlanPage();
        }

        if (body.classList.contains("page-application")) {
            initApplicationPage();
        }

        initHomePage();
        initDebtConsolidationPage();
        initAutoLoanPage();
        initBorrowingPowerPage();
        initEarlyPayoffPage();
        initDebtPayoffPlannerPage();
        initSavingsGrowthPage();
        initMortgagePaymentPage();
        initInvestmentReturnPage();
        initBudgetPlannerPage();
        initRateImpactPage();
        initScenarioSimulatorPage();
        initLoanTimelinePage();
        initRefinancePage();
        initHomeAdvancedLoanModules();
        initPaymentLookupPage();
        initLoanExamplesPage();
        initLoanMapPage();
        initFaqPage();
    }

    function boot() {
        var body = document.body;

        if (!body) {
            return;
        }

        initThemeMode(body);

        applyEditorEditsForPage().then(function () {
            initMotion();
            initPageFeatures(body);

            if (body.classList.contains("page-editor-login")) {
                initEditorLoginPage();
            }

            checkEditorSession().then(function () {
                if (!body.classList.contains("page-editor-login")) {
                    initEditorPanel();
                }
            });
        });
    }

    boot();
})();
