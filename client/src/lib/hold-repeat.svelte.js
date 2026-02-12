/**
 * Creates a hold-repeat controller for keyboard key-hold behavior.
 * After an initial delay, repeatedly calls the callback at a given interval.
 *
 * @param {() => void} callback - Function to call on each repeat
 * @param {{ delay?: number, interval?: number }} options
 * @returns {{ pressed: boolean }} - Set pressed to true/false on keydown/keyup
 */
export function createHoldRepeat(callback, { delay = 250, interval = 60 } = {}) {
	let pressed = $state(false);
	let delayDone = $state(false);

	$effect(() => {
		if (pressed) {
			const tid = setTimeout(() => {
				delayDone = true;
			}, delay);
			return () => clearTimeout(tid);
		} else {
			delayDone = false;
		}
	});

	$effect(() => {
		if (!delayDone) return;
		const iid = setInterval(callback, interval);
		return () => clearInterval(iid);
	});

	return {
		get pressed() {
			return pressed;
		},
		set pressed(v) {
			pressed = v;
		}
	};
}
