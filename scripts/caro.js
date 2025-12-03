document.addEventListener('DOMContentLoaded', () => {

    const track = document.querySelector('.gn-carousel-track');
    const slides = Array.from(document.querySelectorAll('.gn-slide'));
    const nextBtn = document.querySelector('.gn-next');
    const prevBtn = document.querySelector('.gn-prev');

    if (!track || slides.length === 0) return;

    let index = 0;
    const total = slides.length;
    const intervalTime = 8000; // 8 seconds
    let timer;
    let isDragging = false;
    let startPos = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;

    // --- 1. CORE NAVIGATION ---
    function updateSlidePosition() {
        // Safe Modulo for negative numbers
        // Ensures index is always between 0 and total-1
        index = (index % total + total) % total;

        // Move Track
        track.style.transform = `translateX(-${index * 100}%)`;

        // Update 'is-visible' class for CSS animations
        slides.forEach(slide => slide.classList.remove('is-visible'));
        slides[index].classList.add('is-visible');
    }

    function nextSlide() {
        index++;
        updateSlidePosition();
    }

    function prevSlide() {
        index--;
        updateSlidePosition();
    }

    // --- 2. BUTTONS (With Safety) ---
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Stop mobile ghost clicks
            nextSlide();
            resetTimer();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            prevSlide();
            resetTimer();
        });
    }

    // --- 3. AUTO SLIDE MANAGEMENT ---
    function startTimer() {
        // Clear any existing timer first to prevent duplicates
        if (timer) clearInterval(timer);
        timer = setInterval(nextSlide, intervalTime);
    }

    function stopTimer() {
        if (timer) clearInterval(timer);
    }

    function resetTimer() {
        stopTimer();
        startTimer();
    }

    // --- 4. TOUCH SWIPE SUPPORT (Mobile Fix) ---
    // This prevents the user from needing to "click" buttons on mobile
    
    track.addEventListener('touchstart', touchStart);
    track.addEventListener('touchend', touchEnd);
    track.addEventListener('touchmove', touchMove);

    // Mouse events for pausing
    const carousel = document.querySelector('.gn-carousel');
    if (carousel) {
        carousel.addEventListener('mouseenter', stopTimer);
        carousel.addEventListener('mouseleave', startTimer);
    }

    function touchStart(event) {
        stopTimer();
        isDragging = true;
        startPos = getPositionX(event);
    }

    function touchMove(event) {
        if (isDragging) {
            // Optional: You could add "live dragging" visual here if desired
            // const currentPosition = getPositionX(event);
            // const diff = currentPosition - startPos;
        }
    }

    function touchEnd(event) {
        isDragging = false;
        const movedBy = getPositionX(event.changedTouches[0]) - startPos;

        // Threshold: Swipe must be at least 50px
        if (movedBy < -50) nextSlide();
        else if (movedBy > 50) prevSlide();
        
        startTimer();
    }

    function getPositionX(event) {
        return event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
    }

    // --- 5. INIT ---
    // Set initial visible class and start timer
    slides[index].classList.add('is-visible');
    startTimer();

    // Handle Window Resize
    window.addEventListener('resize', () => {
        updateSlidePosition();
    });
});