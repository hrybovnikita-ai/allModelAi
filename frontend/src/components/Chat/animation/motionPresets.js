/** Shared Framer Motion presets for chat (respect reduced motion in components). */
export const messageEntrance = {
  hidden: {
    opacity: 0,
    y: 8,
    filter: 'blur(6px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
  },
};

export const messageEntranceTransition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
};

export const thinkingExit = {
  opacity: 0,
  scale: 0.92,
  filter: 'blur(4px)',
  transition: { duration: 0.22, ease: 'easeIn' },
};

export const thinkingEnter = {
  opacity: 1,
  scale: 1,
  filter: 'blur(0px)',
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
};
