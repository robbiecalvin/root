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
            '  <input id="siteEditorColor" type="color" value="#5da3ff" aria-label="Pick a color">' +
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
        var color = editorState.colorInput ? editorState.colorInput.value : "#5da3ff";
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
                message.style.color = "#5da3ff";
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
                    message.style.color = "#5da3ff";
                    window.setTimeout(function () {
                        window.location.href = "/";
                    }, 300);
                })
                .catch(function () {
                    message.textContent = "Invalid login credentials.";
                    message.style.color = "#ff7b7b";
                });
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
        var form = document.getElementById("emailForm");
        var message = document.getElementById("formMessage");

        if (!form || !message) {
            return;
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var emailInput = document.getElementById("emailInput");
            var email = emailInput ? emailInput.value : "";

            if (email.includes("@")) {
                message.textContent = "You're in. Check your inbox.";
                message.style.color = "green";
                form.reset();
            } else {
                message.textContent = "Please enter a valid email.";
                message.style.color = "red";
            }
        });
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

    function initPageFeatures(body) {
        if (body.classList.contains("page-home")) {
            initHomePage();
        }

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
    }

    function boot() {
        var body = document.body;

        if (!body) {
            return;
        }

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
