import { env } from '$env/dynamic/public';
import { base } from '$app/paths';

export default {
	path: {
		api: env.PUBLIC_API_PATH || `${base}/api`,
		images: env.PUBLIC_IMAGE_PATH || `${base}/images`
	}
};
