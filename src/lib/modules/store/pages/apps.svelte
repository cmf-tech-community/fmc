<script lang="ts">
  // The Apps shelf: installable .wp2app packages for the Watch Pro 2.
  import { Badge } from "$lib/shared/components/badge";
  import { Icon } from "$lib/shared/components/icon";
  import { Page } from "$lib/shared/components/page";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { StoreTabs } from "$lib/shared/components/store-tabs";
  import { fileUrl } from "$lib/shared/api";
  import { compact } from "$lib/shared/lib/format";
  import { MAKE_AN_APP } from "../lib/links";
  import { storeModel } from "../model";

  const {
    $apps: apps,
    $appsLoading: loading,
    $storeErr: storeErr,
    $appsOnWatch: onWatch,
    appsRequested,
  } = storeModel;

  appsRequested();
</script>

<svelte:head><title>Apps for the CMF Watch Pro 2 — FMC</title></svelte:head>

<Page>
  {#snippet header()}
    <div class="bar"><StoreTabs /></div>
  {/snippet}

  <div class="shelf">
    <!-- an app does nothing on a watch without the loader, so that comes before the list -->
    <a class="loader-note" href="/firmware">
      <span class="glyph"><Icon name="memory" size={24} /></span>
      <span class="text">
        <span class="title">Apps need the patched firmware</span>
        <span class="desc">
          A small patch for the stock firmware and the App Loader on top. Set up once, then add and
          remove apps over Bluetooth.
        </span>
      </span>
      <Icon name="chevron_right" size={24} class="go" />
    </a>

    {#if $storeErr}<p class="error">{$storeErr}</p>{/if}

    <ul class="list">
      {#if $loading && !$apps.length}
        {#each Array(6) as _, i (i)}
          <li class="row skeleton">
            <Skeleton width="3.5rem" height="3.5rem" />
            <div class="text">
              <Skeleton width="45%" height="1rem" />
              <Skeleton width="80%" height="0.75rem" />
            </div>
          </li>
        {/each}
      {:else}
        {#each $apps as app (app.id)}
          <li>
            <a class="row" href="/apps/{app.id}">
              {#if app.icon}
                <img class="app-icon" src={fileUrl(app, "icon")} alt="" loading="lazy" />
              {:else}
                <span class="app-icon letter">{app.name.slice(0, 1)}</span>
              {/if}
              <span class="text">
                <span class="title">{app.name}</span>
                {#if app.summary}<span class="desc">{app.summary}</span>{/if}
                <span class="meta">
                  {#if app.version}<span>v{app.version}</span>{/if}
                  {#if $onWatch[app.id] === "update"}
                    <Badge>Update</Badge>
                  {:else if $onWatch[app.id] === "installed"}
                    <Badge quiet>Installed</Badge>
                  {/if}
                  <span class="count">
                    <Icon name="download" size={14} />
                    {compact(app.downloads)}
                  </span>
                </span>
              </span>
              <Icon name="chevron_right" size={24} class="go" />
            </a>
          </li>
        {:else}
          <li class="empty">No apps yet. The first ones are on their way.</li>
        {/each}
      {/if}
    </ul>

    <!-- the shelf is the cmf-tech-community/apps repository: a merged PR there is an app here -->
    <a class="loader-note make" href={MAKE_AN_APP} target="_blank" rel="noopener noreferrer">
      <span class="glyph"><Icon name="code" size={24} /></span>
      <span class="text">
        <span class="title">Make your own app</span>
        <span class="desc">
          Apps are Rust, in the open community apps repository. Open a pull request — once it's
          merged, your app shows up here.
        </span>
      </span>
      <Icon name="open_in_new" size={22} class="go" />
    </a>
  </div>
</Page>

<style>
  .bar {
    padding: 0.5rem 1rem;
  }
  .shelf {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  .error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-error);
  }
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row,
  .loader-note {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 5%);
    color: inherit;
    text-decoration: none;
  }
  a.row,
  .loader-note {
    height: 100%;
    transition:
      background-color 0.15s ease,
      transform var(--spring-transition);

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 9%);
      }
    }
    &:active {
      transform: scale(0.98);
    }
    &:focus-visible {
      outline: 2px solid var(--color-accent);
    }
  }
  .loader-note {
    height: auto;

    .title {
      white-space: normal;
    }
    background: oklch(from var(--color-accent) l c h / 12%);

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-accent) l c h / 18%);
      }
    }
  }
  .glyph {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  /* the watch draws app icons as discs (see docs/app-icons.md in cmf-watch-sdk) — so do we */
  .app-icon {
    flex: none;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    object-fit: cover;
    background: oklch(from var(--color-text) l c h / 8%);

    &.letter {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 600;
      text-transform: uppercase;
      color: oklch(from var(--color-text) l c h / 60%);
    }
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .desc {
    font-size: 0.875rem;
    line-height: 1.35;
    color: oklch(from var(--color-text) l c h / 60%);
  }
  .row .desc {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 50%);
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
  }
  .row :global(.go),
  .loader-note :global(.go) {
    flex: none;
    color: oklch(from var(--color-text) l c h / 40%);
  }
  .skeleton .text {
    gap: 0.5rem;
  }
  .skeleton :global(.skeleton:first-child) {
    border-radius: 50%;
  }
  .empty {
    grid-column: 1 / -1;
    padding: 4rem 0;
    text-align: center;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  @media (max-width: 767px) {
    .bar {
      padding: 0.25rem 0.75rem;
    }
    .shelf {
      gap: 0.75rem;
      padding: 0.75rem;
    }
    .list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* the way in for authors, after the shelf: neutral, so it doesn't compete with the setup note */
  .loader-note.make {
    background: oklch(from var(--color-text) l c h / 5%);

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 9%);
      }
    }
    .glyph {
      color: var(--color-text);
      background: oklch(from var(--color-text) l c h / 10%);
    }
  }
</style>
