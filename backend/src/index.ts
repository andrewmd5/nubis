import { ConsoleLogger } from '@tempojs/common';
import { TempoRouterConfiguration } from '@tempojs/server';
import { TempoRouter } from '@tempojs/cloudflare-worker-router';
import * as Services from './services';
import { TokenInterceptor } from './auth';

// bindings interface
export interface Env {
	DB: D1Database;
}

const logger = new ConsoleLogger('Router');
const options = new TempoRouterConfiguration();
options.enableCors = true;
options.allowedOrigins = ['https://borderlessgam.ing'];
options.transmitInternalErrors = true;
const registry = new Services.TempoServiceRegistry(logger);
const router = new TempoRouter<Env>(logger, registry, options, new TokenInterceptor(logger));

export default {
	async fetch(request: Request, env: Env) {
		return await router.handle(request, env);
	},
};
