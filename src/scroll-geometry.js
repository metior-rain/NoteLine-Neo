// CSS pixels per millisecond. Window height changes visibility, not velocity.
export const BASE_SCROLL_SPEED = .6;
export const scrollVelocity = (speed = 1) => BASE_SCROLL_SPEED * speed;
export const noteY = (hitY, remainingMs, speed = 1) => hitY - remainingMs * scrollVelocity(speed);
export const approachMs = (topY, hitY, speed = 1) => Math.max(0, hitY - topY) / scrollVelocity(speed);
