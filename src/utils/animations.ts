import { gsap } from 'gsap';

export const fadeIn = (element: Element | string, duration: number = 0.5, delay: number = 0) => {
  gsap.fromTo(element, 
    { opacity: 0 }, 
    { opacity: 1, duration, delay, ease: 'power2.out' }
  );
};

export const slideIn = (element: Element | string, direction: 'up' | 'down' | 'left' | 'right' = 'up', duration: number = 0.5, delay: number = 0) => {
  const x = direction === 'left' ? 50 : direction === 'right' ? -50 : 0;
  const y = direction === 'up' ? 50 : direction === 'down' ? -50 : 0;
  
  gsap.fromTo(element,
    { opacity: 0, x, y },
    { opacity: 1, x: 0, y: 0, duration, delay, ease: 'power2.out' }
  );
};

export const staggerList = (elements: Element[] | string, duration: number = 0.4, stagger: number = 0.1) => {
  gsap.fromTo(elements,
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration, stagger, ease: 'power2.out' }
  );
};
