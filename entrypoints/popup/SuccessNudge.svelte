<script lang="ts">
  import { trackAction } from '@/utils/analytics';
  import { nudgeRated, nudgeDeferred, getNudgeStats } from '@/utils/successNudge';
  import { CWS_REVIEW_URL, FEEDBACK_URL } from '@/utils/constants';
  import alfredIcon from '@/assets/icon.png';

  let { onDismiss }: { onDismiss: () => void } = $props();

  const ALFRED_DEEDS = [
    'fetched all those heading tags',
    'hunted down the broken links',
    'combed through the sitemaps',
    'named that theme on sight',
    'kept an eye on the schema',
    'carried the cart on his back',
    'memorized all those admin shortcuts',
    'let you in through the collaborator door',
    'sized every image on the page',
    'read the robots.txt so you never have to',
    'remembered the storefront password',
    "counted every link so you didn't have to",
    'checked your links while you sipped coffee',
  ];
  const alfredDeed = ALFRED_DEEDS[Math.floor(Math.random() * ALFRED_DEEDS.length)];

  const USER_SKILLS = [
    'audit heading structures',
    'chase down broken links',
    'read sitemaps for fun',
    'name themes on sight',
    'speak fluent robots.txt',
    'dissect structured data',
    'run a cart like a surgeon',
  ];
  const userSkill = USER_SKILLS[Math.floor(Math.random() * USER_SKILLS.length)];

  const SKILL_DOMAINS = [
    'SEO',
    'Shopify',
    'link audits',
    'structured data',
    'theme spotting',
    'sitemap forensics',
    'cart wrangling',
    'running a store',
    'the Shopify admin',
  ];
  const skillDomain = SKILL_DOMAINS[Math.floor(Math.random() * SKILL_DOMAINS.length)];

  const MESSAGES = [
    {
      title: "That's more time back in your day.",
      description:
        'Alfred will keep handing it back, free, forever. A quick rating hands some to the next person too.',
    },
    {
      title: 'Wen review?',
      description: 'Ten seconds. Big for the next person who finds Alfred because of it.',
    },
    {
      title: '"No one has ever become poor by giving."',
      description:
        "Anne Frank said that. She wasn't talking about star ratings, but it holds up.",
    },
    {
      title: 'This popup cost us nothing to show you.',
      description:
        'A rating costs you about the same. Ten seconds, and Alfred gets back to work like nothing happened.',
    },
    {
      title: 'You found the secret popup.',
      description:
        "Kidding. It's a review ask. But a charming one, no? And it only ever shows up after Alfred's actually done something for you.",
    },
    {
      title: 'A small favor.',
      description:
        "Rate Alfred. That's it. That's the popup. No trials, no price, just stars and gratitude.",
    },
    {
      title: "You've seen enough to judge.",
      description:
        'So judge. The stars are right there, and whichever number you pick lands somewhere useful. Five stars opens the review page. Anything less turns into private feedback for us.',
    },
    {
      title: 'Caught you being productive.',
      description:
        "Don't worry, we won't tell your team it was mostly Alfred. A five-star rating buys our silence.",
    },
    {
      title: 'Alfred would never beg.',
      description:
        "He's far too dignified. This popup, however, has no such standards. Stars, please.",
    },
    {
      title: 'We rehearsed this ask for weeks.',
      description:
        "And it still comes down to: hey, mind rating Alfred? Ten seconds. We'll be cool about it either way.",
    },
    {
      title: "This is Alfred's performance review.",
      description: `You're the manager now. Be fair, be honest, and remember who ${alfredDeed} for you.`,
    },
    {
      title: 'Look at that beautiful face.',
      description: `Seriously, how does someone this good-looking also ${userSkill}? Rate Alfred before you break more hearts.`,
    },
    {
      title: "Oh great, it's our favorite user.",
      description:
        'We put this popup here just for you. Well, and for the stars. Mostly you though.',
    },
    {
      title: "Someone's been busy.",
      description:
        'Store checked, links audited, looking great while doing it. One more task for the overachiever: stars.',
    },
    {
      title: "They don't make users like you anymore.",
      description: `Sharp, efficient, suspiciously good at ${skillDomain}. A rating from you would mean a lot.`,
    },
    {
      title: "Alfred says you're his favorite.",
      description:
        "He says that to everyone, honestly. But now it's your turn to tell the world about him. Five stars should do it.",
    },
    {
      title: 'Honest answers only.',
      description:
        'Five stars sends you to the review page. Fewer sends us your feedback instead. Both help.',
    },
  ];

  const variant = Math.floor(Math.random() * MESSAGES.length);
  const { title, description } = MESSAGES[variant]!;

  let hovered = $state(0);
  // Snapshot funnel context once at show time so outcome events carry the
  // same impression number even after state mutates.
  let stats = $state({ impression: 0, dismissals: 0 });

  $effect(() => {
    getNudgeStats().then((s) => {
      stats = s;
      trackAction('review_nudge_show', { ...s, variant });
    });
  });

  function handleRate(rating: number) {
    trackAction('credit_click', { source: 'review_nudge', rating, variant, ...stats });
    nudgeRated();
    browser.tabs.create({ url: rating === 5 ? CWS_REVIEW_URL : FEEDBACK_URL });
    onDismiss();
  }

  function handleLater() {
    trackAction('review_nudge_dismiss', { kind: 'later', variant, ...stats });
    nudgeDeferred();
    onDismiss();
  }

  function handleBackdrop() {
    trackAction('review_nudge_dismiss', { kind: 'backdrop', variant, ...stats });
    onDismiss();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="nudge" onclick={(e: MouseEvent) => { if (e.target === e.currentTarget) handleBackdrop(); }}>
  <div class="nudge__card">
    <img src={alfredIcon} alt="" class="nudge__icon" />
    <h2 class="nudge__title">{title}</h2>
    <p class="nudge__text">{description}</p>
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
    <div class="nudge__stars" onmouseleave={() => (hovered = 0)}>
      {#each [1, 2, 3, 4, 5] as star}
        <!-- svelte-ignore a11y_mouse_events_have_key_events -->
        <button
          onclick={() => handleRate(star)}
          onmouseenter={() => (hovered = star)}
          aria-label="Rate {star} star{star > 1 ? 's' : ''}"
          class="nudge__star">
          <svg width="38" height="38" viewBox="0 0 24 24" fill={star <= hovered ? 'var(--star-active)' : 'var(--star-inactive)'} class="nudge__svg">
            <path d="M12 3.5c.3 0 .6.2.7.5l2.2 4.5 5 .7c.3 0 .5.2.6.5s0 .6-.2.8l-3.6 3.5.9 5c0 .3-.1.6-.3.7-.3.2-.6.2-.8 0L12 17l-4.5 2.3c-.3.1-.6.1-.8 0-.2-.2-.4-.4-.3-.7l.9-5L3.7 10c-.2-.2-.3-.5-.2-.8s.3-.4.6-.5l5-.7 2.2-4.5c.1-.3.4-.5.7-.5z" />
          </svg>
        </button>
      {/each}
    </div>
    <button class="nudge__later" onclick={handleLater}>Maybe later</button>
  </div>
</div>

<style>
  .nudge {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--bg-canvas) 55%, transparent);
    backdrop-filter: blur(2px);
    animation: nudgeFade 200ms ease-out;
  }

  .nudge__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    width: 360px;
    padding: 28px 32px 20px;
    background: var(--bg-canvas);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    animation: nudgeCard 300ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .nudge__icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    margin-bottom: 6px;
  }

  .nudge__title {
    font-size: 17px;
    font-weight: 650;
    color: var(--text);
    margin: 0;
  }

  .nudge__text {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
    margin: 0 0 8px;
  }

  .nudge__stars {
    display: flex;
    gap: 6px;
  }

  .nudge__star {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    line-height: 0;
    border-radius: 6px;
    transition: transform 0.1s;
  }

  .nudge__star:hover {
    transform: scale(1.15);
  }

  .nudge__star:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .nudge__svg {
    transition: fill 0.15s;
    pointer-events: none;
  }

  .nudge__later {
    background: none;
    border: none;
    cursor: pointer;
    margin-top: 10px;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-muted);
    border-radius: 6px;
  }

  .nudge__later:hover {
    color: var(--text);
    background: var(--bg-hover);
  }

  @keyframes nudgeFade {
    from { opacity: 0; }
  }

  @keyframes nudgeCard {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
  }
</style>
