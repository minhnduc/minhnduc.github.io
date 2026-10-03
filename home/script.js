/* ============================================
   ACADEMIC PORTFOLIO — SCRIPT
   Author: Nguyễn Đức Minh

   Chức năng:
   1. Mobile navigation toggle (hamburger menu).
   2. Navbar scroll effect (shadow khi scroll).
   3. Active nav link highlight dựa trên scroll.
   4. Back-to-top button show/hide.
   5. Scroll reveal animation cho các section.
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // ===== DOM ELEMENTS =====
    const navbar      = document.getElementById('navbar');
    const navToggle   = document.getElementById('nav-toggle');
    const navMenu     = document.getElementById('nav-menu');
    const navLinks    = document.querySelectorAll('.navbar__link');
    const backToTop   = document.getElementById('back-to-top');
    const sections    = document.querySelectorAll('.section, .hero');

    // ===== 1. MOBILE NAVIGATION TOGGLE =====
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            const isOpen = navMenu.classList.toggle('navbar__menu--open');
            navToggle.setAttribute('aria-expanded', isOpen);

            // Animate hamburger bars into X
            const bars = navToggle.querySelectorAll('.navbar__toggle-bar');
            if (isOpen) {
                bars[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                bars[1].style.opacity   = '0';
                bars[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
            } else {
                bars[0].style.transform = 'none';
                bars[1].style.opacity   = '1';
                bars[2].style.transform = 'none';
            }
        });

        // Close menu when clicking a nav link
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('navbar__menu--open');
                const bars = navToggle.querySelectorAll('.navbar__toggle-bar');
                bars[0].style.transform = 'none';
                bars[1].style.opacity   = '1';
                bars[2].style.transform = 'none';
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navbar.contains(e.target) && navMenu.classList.contains('navbar__menu--open')) {
                navMenu.classList.remove('navbar__menu--open');
                const bars = navToggle.querySelectorAll('.navbar__toggle-bar');
                bars[0].style.transform = 'none';
                bars[1].style.opacity   = '1';
                bars[2].style.transform = 'none';
            }
        });
    }

    // ===== 2. NAVBAR SCROLL SHADOW =====
    function handleNavbarScroll() {
        if (window.scrollY > 20) {
            navbar.classList.add('navbar--scrolled');
        } else {
            navbar.classList.remove('navbar--scrolled');
        }
    }

    // ===== 3. ACTIVE NAV LINK HIGHLIGHT =====
    function highlightActiveLink() {
        const scrollPos = window.scrollY + 100;

        sections.forEach(section => {
            const id = section.getAttribute('id');
            if (!id) return;

            const top    = section.offsetTop;
            const height = section.offsetHeight;

            if (scrollPos >= top && scrollPos < top + height) {
                navLinks.forEach(link => {
                    link.classList.remove('navbar__link--active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('navbar__link--active');
                    }
                });
            }
        });
    }

    // ===== 4. BACK TO TOP BUTTON =====
    function handleBackToTop() {
        if (window.scrollY > 400) {
            backToTop.classList.add('back-to-top--visible');
        } else {
            backToTop.classList.remove('back-to-top--visible');
        }
    }

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ===== 5. SCROLL REVEAL ANIMATION =====
    // Add 'reveal' class to elements that should animate in
    const revealTargets = document.querySelectorAll(
        '.timeline__item, .interest-card, .pub-item, .project-card, ' +
        '.achievement-card, .skill-category, .contact-card, .about__content'
    );

    revealTargets.forEach(el => {
        el.classList.add('reveal');
    });

    // Intersection Observer for reveal
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal--visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    revealTargets.forEach(el => revealObserver.observe(el));

    // ===== SCROLL EVENT LISTENER (throttled) =====
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                handleNavbarScroll();
                highlightActiveLink();
                handleBackToTop();
                ticking = false;
            });
            ticking = true;
        }
    });

    // Initial calls
    handleNavbarScroll();
    highlightActiveLink();
    handleBackToTop();
});
