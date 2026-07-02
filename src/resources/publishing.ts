/**
 * Publishing — the two-step container flow plus convenience wrappers.
 *
 * Flow: `createContainer()` → (optionally wait for processing) →
 * `publishContainer()`. The `publishText` / `publishImage` / `publishVideo` /
 * `publishCarousel` helpers run the whole flow for you.
 */

import { fieldsParam, type ThreadsRequester } from './base.js'
import { ThreadsError } from '../errors.js'
import type {
  ContainerRef,
  ContainerStatus,
  MediaContainerType,
  PublishingLimit,
  ReplyControl,
} from '../types.js'

export interface CreateContainerInput {
  mediaType: MediaContainerType
  text?: string
  /** Required when `mediaType` is `IMAGE`. */
  imageUrl?: string
  /** Required when `mediaType` is `VIDEO`. */
  videoUrl?: string
  /** Mark this container as a carousel child (not published on its own). */
  isCarouselItem?: boolean
  /** Child container ids — required when `mediaType` is `CAROUSEL`. */
  children?: string[]
  /** Make this post a reply to the given media id. */
  replyToId?: string
  replyControl?: ReplyControl
  /** Accessibility description (max 1,000 chars). */
  altText?: string
  linkAttachment?: string
  locationId?: string
  quotePostId?: string
  topicTag?: string
  /** Attach a poll (TEXT posts only). 2–4 options. */
  pollAttachment?: PollAttachment
  /** Publishing user; defaults to the configured user (or `me`). */
  userId?: string
  signal?: AbortSignal
}

export interface PollAttachment {
  optionA: string
  optionB: string
  optionC?: string
  optionD?: string
}

export interface ContainerStatusResult {
  id: string
  status: ContainerStatus
  error_message?: string
}

export interface WaitOptions {
  /** Poll until the container is ready before publishing. */
  waitForReady?: boolean
  pollIntervalMs?: number
  maxWaitMs?: number
}

export type PublishImageInput = { imageUrl: string } & Omit<CreateContainerInput, 'mediaType'>
export type PublishVideoInput = { videoUrl: string } & Omit<CreateContainerInput, 'mediaType'>

export interface PublishCarouselInput {
  items: { imageUrl?: string; videoUrl?: string; altText?: string }[]
  text?: string
  replyControl?: ReplyControl
  userId?: string
  signal?: AbortSignal
  wait?: WaitOptions
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class PublishingResource {
  constructor(private readonly client: ThreadsRequester) {}

  /** Step 1: create a media container. Returns its creation id. */
  createContainer(input: CreateContainerInput): Promise<ContainerRef> {
    const node = input.userId ?? this.client.userNode
    return this.client.request<ContainerRef>({
      method: 'POST',
      path: `/${node}/threads`,
      params: {
        media_type: input.mediaType,
        text: input.text,
        image_url: input.imageUrl,
        video_url: input.videoUrl,
        is_carousel_item: input.isCarouselItem,
        // The API expects a comma-separated list, not a JSON array.
        children: input.children?.join(','),
        reply_to_id: input.replyToId,
        reply_control: input.replyControl,
        alt_text: input.altText,
        link_attachment: input.linkAttachment,
        location_id: input.locationId,
        quote_post_id: input.quotePostId,
        topic_tag: input.topicTag,
        // The API expects a JSON object string with snake_case option keys.
        poll_attachment: input.pollAttachment
          ? JSON.stringify({
              option_a: input.pollAttachment.optionA,
              option_b: input.pollAttachment.optionB,
              option_c: input.pollAttachment.optionC,
              option_d: input.pollAttachment.optionD,
            })
          : undefined,
      },
      signal: input.signal,
    })
  }

  /** Step 2: publish a previously created container. Returns the post id. */
  publishContainer(
    creationId: string,
    options: { userId?: string; signal?: AbortSignal } = {},
  ): Promise<ContainerRef> {
    const node = options.userId ?? this.client.userNode
    return this.client.request<ContainerRef>({
      method: 'POST',
      path: `/${node}/threads_publish`,
      params: { creation_id: creationId },
      signal: options.signal,
    })
  }

  /** Reads a container's processing status. */
  getContainerStatus(
    containerId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<ContainerStatusResult> {
    return this.client.request<ContainerStatusResult>({
      method: 'GET',
      path: `/${containerId}`,
      params: { fields: fieldsParam(['id', 'status', 'error_message']) },
      signal: options.signal,
    })
  }

  /**
   * Creates a container, optionally waits for media processing, then publishes.
   * `waitForReady` defaults to `true` for `VIDEO`/`CAROUSEL` (which need
   * server-side processing) and `false` otherwise.
   */
  async createAndPublish(
    input: CreateContainerInput,
    wait: WaitOptions = {},
  ): Promise<ContainerRef> {
    const { id: creationId } = await this.createContainer(input)

    const shouldWait =
      wait.waitForReady ?? (input.mediaType === 'VIDEO' || input.mediaType === 'CAROUSEL')
    if (shouldWait) {
      await this.waitForContainer(creationId, wait, input.signal)
    }

    return this.publishContainer(creationId, {
      userId: input.userId,
      signal: input.signal,
    })
  }

  /** Convenience: publish a text-only post. */
  publishText(
    text: string,
    options: Omit<CreateContainerInput, 'mediaType' | 'text'> = {},
  ): Promise<ContainerRef> {
    return this.createAndPublish({ ...options, mediaType: 'TEXT', text })
  }

  /** Convenience: publish a text post with a poll (2–4 options). */
  publishPoll(
    text: string,
    poll: PollAttachment,
    options: Omit<CreateContainerInput, 'mediaType' | 'text' | 'pollAttachment'> = {},
  ): Promise<ContainerRef> {
    return this.createAndPublish({ ...options, mediaType: 'TEXT', text, pollAttachment: poll })
  }

  /** Delete a published post. Requires the `threads_delete` scope. */
  deletePost(postId: string, options: { signal?: AbortSignal } = {}): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      method: 'DELETE',
      path: `/${postId}`,
      signal: options.signal,
    })
  }

  /** Convenience: publish a single image post. */
  publishImage(input: PublishImageInput): Promise<ContainerRef> {
    return this.createAndPublish({ ...input, mediaType: 'IMAGE' })
  }

  /** Convenience: publish a single video post (waits for processing). */
  publishVideo(input: PublishVideoInput): Promise<ContainerRef> {
    return this.createAndPublish({ ...input, mediaType: 'VIDEO' })
  }

  /**
   * Convenience: publish a carousel. Each item becomes a child container, then
   * a parent `CAROUSEL` container is created and published.
   */
  async publishCarousel(input: PublishCarouselInput): Promise<ContainerRef> {
    if (input.items.length < 2) {
      throw new ThreadsError('A carousel requires at least 2 items.')
    }
    const children = await Promise.all(
      input.items.map((item) =>
        this.createContainer({
          mediaType: item.videoUrl ? 'VIDEO' : 'IMAGE',
          imageUrl: item.imageUrl,
          videoUrl: item.videoUrl,
          altText: item.altText,
          isCarouselItem: true,
          userId: input.userId,
          signal: input.signal,
        }).then((ref) => ref.id),
      ),
    )

    return this.createAndPublish(
      {
        mediaType: 'CAROUSEL',
        children,
        text: input.text,
        replyControl: input.replyControl,
        userId: input.userId,
        signal: input.signal,
      },
      input.wait ?? {},
    )
  }

  /** Reads remaining publish/reply/delete quotas for the user. */
  getPublishingLimit(
    options: { userId?: string; signal?: AbortSignal } = {},
  ): Promise<PublishingLimit> {
    const node = options.userId ?? this.client.userNode
    return this.client.request<PublishingLimit>({
      method: 'GET',
      path: `/${node}/threads_publishing_limit`,
      params: {
        fields: fieldsParam([
          'quota_usage',
          'config',
          'reply_quota_usage',
          'reply_config',
          'delete_quota_usage',
          'delete_config',
        ]),
      },
      signal: options.signal,
    })
  }

  /** Polls a container until it is ready to publish, or throws on failure. */
  private async waitForContainer(
    containerId: string,
    wait: WaitOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    const pollIntervalMs = wait.pollIntervalMs ?? 2_000
    const maxWaitMs = wait.maxWaitMs ?? 60_000
    const deadline = Date.now() + maxWaitMs

    for (;;) {
      const { status, error_message } = await this.getContainerStatus(containerId, { signal })
      if (status === 'FINISHED' || status === 'PUBLISHED') return
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new ThreadsError(
          `Container ${containerId} failed to process: ${status}${
            error_message ? ` (${error_message})` : ''
          }`,
        )
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new ThreadsError(
          `Container ${containerId} not ready after ${maxWaitMs}ms (status: ${status}).`,
        )
      }
      await sleep(pollIntervalMs)
    }
  }
}
