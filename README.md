# Nubis

Nubis is a lightweight and cost-effective solution for Steam developers to gather and manage feature requests from their game's community. This self-hostable application leverages Cloudflare Workers for serverless functionality and database, keeping costs low (either free or $5 based on usage).

It is meant to be a cost effective alternative to UserVoice, Featurebase, and other feature request platforms that charge a monthly fee. Nubis is designed to be simple, easy to use, and focused on the core functionality of feature requests and voting.

## Tech Stack

- **Bebop**: Data serialization library
- **Tempo**: High-performance RPC framework
- **Cloudflare Workers**: Serverless computing environment and database
- **Railway**: OpenID Proxy Hosting

## Repository Structure

This is a monorepo containing the following components:

- **backend**: A Cloudflare Worker powered by Tempo RPC, handling the core application logic.
- **frontend**: A lightweight, frameworkless static website for the user interface, deployable on any static hosting service like Cloudflare Pages.
- **gateway**: An authentication gateway for Steam sign-in and session token generation running on Cloudflare Workers.
- **proxy**: An OpenID proxy server for communication with the Steam Community website.

## Key Features

- **Steam Authentication**: Users can sign in with their Steam accounts.
- **Access Control**: Restrict access based on ownership of the base game and specified DLCs.
- **Feature Requests**: Users can submit and vote on feature requests.
- **Voting System**: A voting mechanism to prioritize popular feature requests.

## Roadmap

- Simple administrative controls
- Sorting and filtering options
- Comment system for discussions
- A richer text editor for feature requests

## Contributing

We welcome contributions! Please follow the [contributing guidelines](CONTRIBUTING.md) when submitting pull requests.

## License

This project is licensed under the [MIT License](LICENSE).