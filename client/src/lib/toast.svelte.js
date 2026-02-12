let toasts = $state([]);
let nextId = 0;

export function addToast(message) {
	const id = nextId++;
	toasts = [...toasts, { id, message }];
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 1000);
}

export function getToasts() {
	return toasts;
}
