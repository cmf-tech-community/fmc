<script lang="ts">
  // One firmware image: what it changes, how far it has been proven, and the download —
  // which waits for the reader to say they know what flashing can do.
  import { BackBtn } from "$lib/shared/components/back-btn";
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Checkbox } from "$lib/shared/components/checkbox";
  import { Icon } from "$lib/shared/components/icon";
  import { Page } from "$lib/shared/components/page";
  import { Prose } from "$lib/shared/components/prose";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { StatStrip } from "$lib/shared/components/stat-strip";
  import { fileUrl } from "$lib/shared/api";
  import { compact, day } from "$lib/shared/lib/format";
  import { DEVICES, deviceLabel } from "$lib/modules/market/lib/devices";
  import { bleModel } from "$lib/modules/device/model";
  import {
    firmwareKind,
    flashable,
    isLoader,
    recordDevice,
    testedLabel,
    testedOnHardware,
  } from "../lib/firmware";
  import { FLASH_LIMITS, WATCH_UTILS_DOCS } from "../lib/links";
  import { storeModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const {
    $firmware: firmware,
    $firmwareLoading: loading,
    $riskAccepted: riskAccepted,
    firmwareRequested,
    riskAcceptedSet,
    flashRequested,
    downloadRequested,
    $imageSaving: imageSaving,
    $imageFetching: imageFetching,
    $imageProgress: imageProgress,
    $packageFetching: packageFetching,
    loaderInstallRequested,
    $imageErr: imageErr,
    $firmwareOnWatch: onWatch,
    $wrongWatch: wrongWatch,
  } = storeModel;
  const {
    $bleInfo: watch,
    $bleStatus: bleStatus,
    $connecting: connecting,
    $otaFlashing: flashing,
    $otaProgress: progress,
    $otaResult: result,
    $otaError: otaError,
    $wp2: wp2,
    $wp2Reading: wp2Reading,
    $installing: installing,
    $installProgress: installProgress,
    $installed: installed,
    $installError: installError,
    OTA_MIN_BATTERY,
    connectRequested,
  } = bleModel;
  const busy = $derived(
    $imageFetching || $imageSaving || $packageFetching || $flashing || $installing,
  );
  const done = $derived($result === "done" || Boolean($installed));
  // one bar for the whole job: the download, then the transfer
  const pct = $derived($imageProgress ?? $progress ?? $installProgress ?? 0);
  const loader = $derived(isLoader($firmware?.kind));
  const error = $derived($imageErr || $otaError || $installError);

  $effect(() => {
    firmwareRequested(id);
  });

  const fw = $derived($firmware);
  const kind = $derived(firmwareKind(fw?.kind));
  const onHardware = $derived(testedOnHardware(fw?.tested));
  const device = $derived(recordDevice(fw?.device));
  const deviceName = $derived(DEVICES.find((d) => d.value === device)?.label ?? device);
  // another watch's image: FMC only downloads it, the Install button isn't there to press
  const ota = $derived(flashable(device));
  const stats = $derived(
    fw
      ? [
          ...(fw.version ? [{ label: "Version", value: fw.version }] : []),
          { label: "Downloads", value: compact(fw.downloads) },
        ]
      : [],
  );
</script>

<svelte:head><title>{fw?.name ?? "Firmware"} — firmware for the {deviceName}</title></svelte:head>

<Page>
  <div class="detail">
    <BackBtn href="/firmware" />

    {#if fw}
      <div class="cover" class:bare={!fw.cover}>
        {#if fw.cover}
          <img src={fileUrl(fw, "cover")} alt="" />
        {:else}
          <Icon name={kind.icon} size={48} />
        {/if}
      </div>

      <header class="identity">
        <h1>{fw.name}</h1>
        {#if fw.summary}<p class="summary">{fw.summary}</p>{/if}
        <div class="badges">
          {#if !fw.published}<Badge warn>Draft</Badge>{/if}
          <Badge quiet>{kind.label}</Badge>
          {#if testedLabel(fw.tested)}
            <Badge quiet={onHardware} warn={!onHardware}>
              <Icon name={onHardware ? "verified" : "warning"} size={14} />
              {testedLabel(fw.tested)}
            </Badge>
          {/if}
          {#if deviceLabel(device)}<Badge quiet={ota} warn={!ota}>{deviceLabel(device)}</Badge>{/if}
        </div>
      </header>

      <StatStrip items={stats} />

      <!-- the whole action in one block: the warning, the tick, two buttons, one status line.
           Everything else — preconditions, the description, links — waits in "Details". -->
      <section class="act">
        {#if !ota}
          <div class="disclaimer device" role="note">
            <Icon name="block" size={20} />
            <span>
              Only for the {deviceName}. FMC installs firmware on a Watch Pro 2 only, so this one is
              a download — and flashing it onto a Watch Pro 2 can brick it.
            </span>
          </div>
        {/if}
        {#if $wrongWatch}
          <p class="err" role="alert">
            The connected watch is “{$watch?.name ?? "unnamed"}”, and this firmware is for the
            {deviceName}. It can't be installed on this watch from here — download only.
          </p>
        {/if}
        <div class="disclaimer" role="note">
          <Icon name="warning" size={20} />
          <span>
            You install it at your own risk. FMC takes no responsibility for your watch.
          </span>
        </div>

        {#if fw.image}
          <label class="accept">
            <Checkbox checked={$riskAccepted} onChange={(v) => riskAcceptedSet(v)} />
            <span>I accept the risk</span>
          </label>
        {/if}

        <div class="buttons">
          <Button
            kind="secondary"
            size="large"
            onClick={() => downloadRequested()}
            disabled={!fw.image || !$riskAccepted || busy}
          >
            <Icon name="download" size={22} />
            Download
          </Button>
          {#if !ota}
            <!-- no Install, no Connect: nothing on this page can send it to a watch -->
          {:else if !$watch}
            <Button size="large" onClick={() => connectRequested()} disabled={$connecting}>
              <Icon name="bluetooth" size={22} />
              {$connecting ? "Connecting…" : "Connect"}
            </Button>
          {:else}
            <Button
              size="large"
              onClick={() => (loader ? loaderInstallRequested() : flashRequested())}
              disabled={!fw.image || !$riskAccepted || busy || done || $wrongWatch}
            >
              <Icon name="bolt" size={22} />
              Install
            </Button>
          {/if}
        </div>

        {#if $imageProgress !== null || $flashing || $installing}
          <div class="progress">
            <div class="progress-row">
              <span>{$imageProgress !== null ? "Downloading" : "Installing on the watch"}</span>
              <span class="pct">{pct}%</span>
            </div>
            <progress max="100" value={pct}></progress>
            {#if $flashing}<p class="muted">Keep this tab open and the watch close.</p>{/if}
          </div>
        {/if}

        {#if $installed}
          <p class="ok"><Icon name="check_circle" size={20} /> Installed on the watch.</p>
        {/if}
        {#if $result === "done"}
          <p class="ok">
            <Icon name="check_circle" size={20} /> Sent. The watch installs it and restarts — leave it
            on the charger.
          </p>
        {/if}
        {#if error}<p class="err">{error}</p>{/if}

        <!-- one quiet line: who may, what the watch runs, how it compares -->
        <p class="muted state">
          {#if $watch}
            {#if $wp2Reading}
              Checking the watch…
            {:else if $wp2 === "stock"}
              Watch: stock firmware.
            {:else if $wp2}
              Watch: patched firmware (stub {$wp2.stub.version}){#if $wp2.loader}, App Loader v{$wp2
                  .loader.version}{/if}.
            {/if}
            {#if $onWatch === "update"}<Badge>Update available</Badge>{/if}
            {#if $onWatch === "installed"}<Badge quiet>Installed</Badge>{/if}
          {/if}
        </p>
      </section>

      <details class="more">
        <summary>Details</summary>
        <div class="more-body">
          {#if loader}
            <p>
              It goes into its own slot over Bluetooth — no flashing, the firmware stays as it is.
              Needs the patched firmware on the watch. The CLI way:
            </p>
            <pre><code>wp2apps install loader.wp2app --address &lt;address&gt;</code></pre>
          {:else if ota}
            <h3>Before you install</h3>
            <ul class="checklist">
              <li>Watch on its charger, at {OTA_MIN_BATTERY}% or more</li>
              <li>Phone's Bluetooth off, so it can't grab the watch mid-update</li>
              <li>This tab open, the computer awake and close by</li>
            </ul>
          {/if}
          {#if kind.hint || fw.base}
            <p class="hint">
              {kind.hint}
              {#if fw.base}Built on {fw.base}.{/if}
            </p>
          {/if}
          {#if fw.description}<Prose source={fw.description} />{/if}
          <div class="links">
            {#if fw.source}
              <Button kind="secondary" href={fw.source} external>
                <Icon name="code" size={20} /> Source
              </Button>
            {/if}
            {#if fw.demo}
              <Button kind="secondary" href={fw.demo} external>
                <Icon name="play_circle" size={20} /> Emulator
              </Button>
            {/if}
            {#if fw.video}
              <Button kind="secondary" href={fw.video} external>
                <Icon name="smart_display" size={20} /> Video
              </Button>
            {/if}
            <Button kind="secondary" href={WATCH_UTILS_DOCS} external>
              <Icon name="menu_book" size={20} /> Flashing guide
            </Button>
            <Button kind="ghost" href={FLASH_LIMITS} external>Limits</Button>
          </div>
        </div>
      </details>

      <p class="dates">
        {#if fw.author}By {fw.author} ·{/if}
        Updated {day(fw.updated)}
      </p>
    {:else if $loading}
      <Skeleton height="12rem" />
      <Skeleton width="60%" height="2rem" />
      <Skeleton width="85%" height="1rem" />
      <Skeleton height="4rem" />
      <Skeleton height="10rem" />
    {:else}
      <p class="empty">Firmware not found.</p>
    {/if}
  </div>
</Page>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 40rem;
    margin: 0 auto;
    padding: 1rem 1rem 2rem;
  }
  .cover {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: var(--border-radius);
    color: oklch(from var(--color-text) l c h / 70%);
    background:
      radial-gradient(
        circle at 25% 15%,
        oklch(from var(--color-accent) l c h / 30%),
        transparent 65%
      ),
      oklch(from var(--color-text) l c h / 6%);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    /* without a picture it is a band, not a poster — no reason to spend a screen on a wash */
    &.bare {
      aspect-ratio: auto;
      height: 6.5rem;
    }
  }
  .identity {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .summary {
    margin: 0;
    line-height: 1.35;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .hint,
  .dates {
    margin: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  p {
    margin: 0;
  }
  .act {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  /* the one warning on the page: a red plate, one line */
  .disclaimer {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    border-radius: var(--border-radius);
    line-height: 1.4;
    color: var(--color-error);
    background: oklch(from var(--color-error) l c h / 12%);

    :global(.icon) {
      flex: none;
    }
    /* which watch is the one thing on this plate to read first */
    &.device {
      font-weight: 600;
    }
  }
  .accept {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    cursor: pointer;
    font-weight: 500;
  }
  /* two buttons side by side, or Download alone across the row */
  .buttons {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 0.5rem;
  }
  .progress {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .progress-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
  }
  .pct {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  /* everything that isn't the action, folded */
  .more {
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);

    summary {
      padding: 0.875rem 0;
      cursor: pointer;
      font-weight: 500;
    }
  }
  .more-body {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    line-height: 1.5;

    h3 {
      margin: 0;
      font-size: 1.125rem;
    }
  }
  pre {
    margin: 0;
    padding: 0.625rem 0.75rem;
    overflow-x: auto;
    border-radius: calc(var(--border-radius) / 2);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: oklch(from var(--color-text) l c h / 6%);

    code {
      font: inherit;
    }
  }
  .checklist {
    margin: 0;
    padding-inline-start: 1.25rem;
    line-height: 1.6;
  }
  .muted {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .ok {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .err {
    color: var(--color-error);
  }
  progress {
    width: 100%;
    height: 0.375rem;
    accent-color: var(--color-accent);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;

    &:empty {
      display: none;
    }
  }
  .empty {
    padding: 4rem 0;
    text-align: center;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  @media (max-width: 767px) {
    .links > :global(*) {
      flex: 1 1 auto;
    }
  }
</style>
