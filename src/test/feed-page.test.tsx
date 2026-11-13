import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ session: { user: { id: 'me' }, expires: 'initial' } }));
vi.mock('@/lib/auth-client', () => ({ useSession: () => ({ data: auth.session }) }));
vi.mock('@/lib/hooks/usePosts', () => ({ usePosts: () => ({
  highlightPostId: null, highlightCommentId: null, comments: {}, expandedComments: new Set(), showAllComments: new Set(), viewedPosts: new Set(),
}) }));
vi.mock('@/components/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/TrendsPanel', () => ({ default: () => null }));
vi.mock('@/components/RepostModal', () => ({ default: () => null }));
vi.mock('@/components/PostForm', () => ({ default: ({ onPostCreated }: { onPostCreated: () => void }) => <button onClick={onPostCreated}>Publish</button> }));
vi.mock('@/components/PostCard', () => ({ default: ({ post }: { post: { content: string } }) => <article>{post.content}</article> }));
import FeedPage from '@/app/feed/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps mounted posts when the same session refreshes and while new posts are fetched', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  let finishRefresh: (value: unknown) => void = () => {};
  const feed = { posts: [{ id: 'post', content: 'Existing post', likes: [] }], total: 20 };
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/bookmarks') return Promise.resolve({ ok: true, json: async () => [] });
    return Promise.resolve({ ok: true, json: async () => feed });
  });
  vi.stubGlobal('fetch', fetchMock);
  const { rerender } = render(<FeedPage />);
  const article = await screen.findByRole('article');
  await waitFor(() => expect(screen.getByText('Загрузить ещё')).toBeEnabled());
  const initialCalls = fetchMock.mock.calls.length;

  auth.session = { user: { id: 'me' }, expires: 'refreshed' };
  rerender(<FeedPage />);
  expect(fetchMock).toHaveBeenCalledTimes(initialCalls);
  expect(screen.getByRole('article')).toBe(article);

  fetchMock.mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
  fireEvent.click(screen.getByText('Publish'));
  expect(screen.getByRole('article')).toBe(article);
  expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument();
  finishRefresh({ ok: true, json: async () => ({ ...feed, posts: [{ ...feed.posts[0], content: 'Updated post' }] }) });
  await screen.findByText('Updated post');
  expect(screen.getByRole('article')).toBe(article);
});
