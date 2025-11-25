        document.addEventListener('DOMContentLoaded', () => {

            const track = document.querySelector('.gn-carousel-track');
            const slides = document.querySelectorAll('.gn-slide');
            const nextBtn = document.querySelector('.gn-next');
            const prevBtn = document.querySelector('.gn-prev');

            let index = 0;
            const total = slides.length;
            const interval = 10000; // 10 seconds autoplay

            // Move to a specific slide (0%, -100%, -200% ...)
            function goTo(i) {
                index = (i + total) % total;
                track.style.transform = `translateX(-${index * 100}%)`;
            }

            // Buttons
            nextBtn.addEventListener('click', () => goTo(index + 1));
            prevBtn.addEventListener('click', () => goTo(index - 1));

            // Auto-slide
            let timer = setInterval(() => goTo(index + 1), interval);

            // Pause when hovering
            const carousel = document.querySelector('.gn-carousel');

            carousel.addEventListener('mouseenter', () => {
                clearInterval(timer);
            });

            carousel.addEventListener('mouseleave', () => {
                clearInterval(timer);
                timer = setInterval(() => goTo(index + 1), interval);
            });

            // Keep current slide when resizing window
            window.addEventListener('resize', () => {
                goTo(index);
            });

        });