(function () {
    "use strict";

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

    var body = document.body;

    if (!body) {
        return;
    }

    initMotion();

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
})();
