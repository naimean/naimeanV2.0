/**
 * NaimeanAgent — future Agents SDK integration stub.
 *
 * This file is a placeholder for an AI agent that will run on Cloudflare's
 * Agent infrastructure. Extend this class once Agents SDK support is needed.
 */

export class NaimeanAgent {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    return new Response('NaimeanAgent: not yet implemented', { status: 501 });
  }
}
