import { ServerContext, AuthContext } from '@tempojs/server';
import { TempoError, TempoStatusCode } from '@tempojs/common';
import {
	TempoServiceRegistry,
	BaseVoiceService,
	IEmpty,
	IFeatureRequest,
	FeatureRequestStatus,
	User,
	IUser,
	IVoteRequest,
	FeatureRequestResponse,
	IFeatureRequestResponse
} from './services.gen';
import { Env } from '..';
import { Guid } from 'bebop';
import sanitizeHtml from 'sanitize-html';

function getUserFromContext(context: AuthContext): IUser {
	const peerKey = context?.peerIdentityKey;
	if (!peerKey) {
		throw new TempoError(TempoStatusCode.UNAUTHENTICATED, 'User is not authenticated');
	}
	const user = context.findPropertyByName('user', 'data')?.getValue<IUser>();
	if (!user) {
		throw new TempoError(TempoStatusCode.INVALID_ARGUMENT, 'User data is missing');
	}
	return user;
}

/**
 * TODO
 */
@TempoServiceRegistry.register(BaseVoiceService.serviceName)
export class VoiceService extends BaseVoiceService {
	public async test(record: IEmpty, context: ServerContext): Promise<IUser> {
		if (!context.authContext?.isPeerAuthenticated) {
			throw new TempoError(TempoStatusCode.UNAUTHENTICATED, 'User is not authenticated');
		}
		return getUserFromContext(context.authContext);
	}

	public async *getFeatureRequests(record: IEmpty, context: ServerContext): AsyncGenerator<IFeatureRequestResponse, void, undefined> {
		if (!context.authContext?.isPeerAuthenticated) {
			throw new TempoError(TempoStatusCode.UNAUTHENTICATED, 'User is not authenticated');
		}

		const user = getUserFromContext(context.authContext);


		const { results } = await context.getEnvironment<Env>().DB.prepare(`
  SELECT
    fr.id, fr.creatorId, fr.upvotes, fr.downvotes, fr.status, fr.title, fr.description, fr.created, fr.updated, fr.weight,
    u.id AS creator_id, u.name AS creator_name, u.level AS creator_level, u.avatar AS creator_avatar,
    u.playTime AS creator_playTime, u.weight AS creator_weight, u.profileUrl AS creator_profileUrl,
    COALESCE(uv.upvote, 0) AS user_upvote,
    COALESCE(uv.downvote, 0) AS user_downvote
  FROM
    FeatureRequest fr
    JOIN User u ON fr.creatorId = u.id
    LEFT JOIN (
      SELECT
        userId,
        featureRequestId,
        MAX(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvote,
        MAX(CASE WHEN vote = 2 THEN 1 ELSE 0 END) AS downvote
      FROM
        UserVote
      WHERE
        userId = CAST(? AS BIGINT)
      GROUP BY
        userId, featureRequestId
    ) uv ON fr.id = uv.featureRequestId
`).bind(user.id.toString()).all();


		if (!results) {
			return;
		}


		const featureRequests: IFeatureRequestResponse[] = results.map((row: any) => ({
			request: {
				id: Guid.parseGuid(row.id),
				creatorId: BigInt(row.creatorId),
				upvotes: Number(row.upvotes),
				downvotes: Number(row.downvotes),
				status: row.status as FeatureRequestStatus,
				title: row.title,
				description: row.description,
				created: new Date(row.created),
				updated: new Date(row.updated),
				weight: Number(row.weight),
			},
			creator: {
				id: BigInt(row.creator_id),
				name: row.creator_name,
				level: Number(row.creator_level),
				avatar: row.creator_avatar,
				playTime: Number(row.creator_playTime),
				weight: Number(row.creator_weight),
				profileUrl: row.creator_profileUrl,
				ownedApps: [],
			},
			userVote: row.user_upvote === 1 ? 1 : row.user_downvote === 1 ? 2 : 0,
		}));

		// sort by weight and total votes (upvotes - downvotes)
		featureRequests.sort((a, b) => {
			const weightDiff = b.request.weight! - a.request.weight!;
			if (weightDiff !== 0) {
				return weightDiff;
			}
			const totalVotesA = a.request.upvotes! - a.request.downvotes!;
			const totalVotesB = b.request.upvotes! - b.request.downvotes!;
			return totalVotesB - totalVotesA;
		});

		for (const featureRequest of featureRequests) {
			yield featureRequest;
		}
	}

	public async createFeatureRequest(record: IFeatureRequest, context: ServerContext): Promise<IFeatureRequest> {
		if (!context.authContext?.isPeerAuthenticated || !context.authContext?.peerIdentityKey) {
			throw new TempoError(TempoStatusCode.UNAUTHENTICATED, 'User is not authenticated');
		}

		if (!record.title?.trim()) {
			throw new TempoError(TempoStatusCode.INVALID_ARGUMENT, 'Title is required');
		}
		if (!record.description?.trim()) {
			throw new TempoError(TempoStatusCode.INVALID_ARGUMENT, 'Description is required');
		}

		if (record.title.length > 75) {
			throw new TempoError(TempoStatusCode.INVALID_ARGUMENT, 'Title is too long');
		}

		if (record.description.length > 560) {
			throw new TempoError(TempoStatusCode.INVALID_ARGUMENT, 'Description is too long');
		}


		const user = getUserFromContext(context.authContext);
		// we don't need ALWAYS UP TO DATE user info, so we update whenver they create a feature request
		const result = await context.getEnvironment<Env>().DB.prepare(`
        INSERT OR REPLACE INTO User (id, name, level, avatar, playTime, weight, profileUrl)
        VALUES (CAST(? AS BIGINT), ?, ?, ?, ?, ?, ?)
      `).bind(user.id.toString(), user.name, user.level, user.avatar, user.playTime, user.weight, user.profileUrl).run();

		if (result.error) {
			this.logger.error('Failed to create user', { error: result.error });
			throw new TempoError(TempoStatusCode.INTERNAL, 'Failed to create feature request');
		}

		record.created = new Date();
		record.updated = new Date();
		record.creatorId = user.id;
		record.upvotes = 0;
		record.downvotes = 0;
		record.status = FeatureRequestStatus.None;
		record.weight = user.weight;
		record.id = Guid.newGuid();


		console.log("Unsanitized title: " + record.title);
		console.log("Unsanitized description: " + record.description);
		const allowedTags = ['b', 'i', 'u'];
		record.title = sanitizeHtml(record.title.trim(), { allowedTags });
		record.description = sanitizeHtml(record.description.trim(), { allowedTags });
		record.description = record.description.replace(/\r\n|\r|\n/g, '</br>');
		console.log("Sanitized title: " + record.title);
		console.log("Sanitized description: " + record.description);

		const insertResult = await context.getEnvironment<Env>().DB.prepare(`
		INSERT INTO FeatureRequest (id, title, description, created, updated, creatorId, upvotes, downvotes, status, weight)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CAST(? AS BIGINT), ?, ?, ?, ?)
	  `).bind(record.id.toString(), record.title, record.description, record.creatorId.toString(), record.upvotes, record.downvotes, record.status, record.weight).run();

		if (insertResult.error) {
			this.logger.error('Failed to create feature request', { error: insertResult.error });
			throw new TempoError(TempoStatusCode.INTERNAL, 'Failed to create feature request');
		}
		return record;
	}

	public deleteFeatureRequest(record: IFeatureRequest, context: ServerContext): Promise<IEmpty> {
		throw new Error('Method not implemented.');
	}

	public async vote(record: IVoteRequest, context: ServerContext): Promise<IEmpty> {
		if (!context.authContext?.isPeerAuthenticated || !context.authContext?.peerIdentityKey) {
			throw new TempoError(TempoStatusCode.UNAUTHENTICATED, 'User is not authenticated');
		}

		if (record.featureRequestId === undefined) {
			throw new TempoError(TempoStatusCode.INVALID_ARGUMENT, 'Feature request ID is required');
		}

		const user = getUserFromContext(context.authContext);

		// Check the user's previous vote
		const result = await context.getEnvironment<Env>().DB.prepare(`
    SELECT vote FROM UserVote
    WHERE userId = CAST(? AS BIGINT) AND featureRequestId = ?
  `).bind(user.id.toString(), record.featureRequestId.toString()).first() as any;

		const previousVote = result === null ? 0 : result.vote;

		if (record.vote === 0) {
			// User wants to unvote
			await context.getEnvironment<Env>().DB.prepare(`
      DELETE FROM UserVote
      WHERE userId = CAST(? AS BIGINT) AND featureRequestId = ?
    `).bind(user.id.toString(), record.featureRequestId.toString()).run();

			// Update the upvotes and downvotes count in the FeatureRequest table
			await context.getEnvironment<Env>().DB.prepare(`
      UPDATE FeatureRequest
      SET upvotes = upvotes - CASE WHEN ? = 1 THEN 1 ELSE 0 END,
          downvotes = downvotes - CASE WHEN ? = 2 THEN 1 ELSE 0 END
      WHERE id = ?
    `).bind(previousVote, previousVote, record.featureRequestId.toString()).run();
		} else {
			// User wants to change or add a vote
			await context.getEnvironment<Env>().DB.prepare(`
      INSERT INTO UserVote (userId, featureRequestId, vote)
      VALUES (CAST(? AS BIGINT), ?, ?)
      ON CONFLICT(userId, featureRequestId) DO UPDATE SET vote = ?
    `).bind(user.id.toString(), record.featureRequestId.toString(), record.vote, record.vote).run();

			// Update the upvotes and downvotes count in the FeatureRequest table
			await context.getEnvironment<Env>().DB.prepare(`
      UPDATE FeatureRequest
      SET upvotes = upvotes + CASE
                                 WHEN ? = 1 AND ? <> 1 THEN 1
                                 WHEN ? = 0 AND ? = 1 THEN -1
                                 ELSE 0
                               END,
          downvotes = downvotes + CASE
                                     WHEN ? = 2 AND ? <> 2 THEN 1
                                     WHEN ? = 0 AND ? = 2 THEN -1
                                     ELSE 0
                                   END
      WHERE id = ?
    `).bind(
				record.vote, previousVote,
				record.vote, previousVote,
				record.vote, previousVote,
				record.vote, previousVote,
				record.featureRequestId.toString()
			).run();
		}

		return {};
	}

}
