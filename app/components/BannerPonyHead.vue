<script setup lang="ts">
import type { SkinId } from '~/utils/skins'

// A forward-facing chibi pony head that replaces the banner's football planet
// when a skin is active. The base (tinted halo + ring, ears, coat face, big
// eyes, muzzle) is shared and colour-driven; each pony gets a bespoke mane.
// Root is a <g> so it drops into the banner SVG inside the ballScale transform.
const props = defineProps<{ skin: SkinId }>()

interface Head {
  coat: string
  coatShade: string
  ear: string
  eye: string
  ring: string
}
const HEADS: Record<SkinId, Head> = {
  twilight: { coat: '#cdbbf2', coatShade: '#b29be4', ear: '#d8c2e6', eye: '#8b5fd0', ring: '#6c4fd0' },
  rainbow: { coat: '#bfe6ff', coatShade: '#9bd2f4', ear: '#d2e7f3', eye: '#d6457f', ring: '#39a0e6' },
  pinkie: { coat: '#f8c2de', coatShade: '#f0a3cb', ear: '#f7cbdf', eye: '#5fa9e0', ring: '#e8489a' },
  applejack: { coat: '#f7bf86', coatShade: '#eda257', ear: '#f3cb9e', eye: '#5bbf6a', ring: '#caa24a' },
  rarity: { coat: '#f4f1fb', coatShade: '#ddd4ef', ear: '#ece4f5', eye: '#5b8fd0', ring: '#7a5cc0' },
  fluttershy: { coat: '#fceca6', coatShade: '#f4da6e', ear: '#fbe9b2', eye: '#46b3a0', ring: '#f6a8c8' },
}
const c = computed(() => HEADS[props.skin])
</script>

<template>
  <g>
    <!-- tinted halo + ring keep the round "planet" silhouette at any scale -->
    <circle cx="640" cy="416" r="300" :fill="c.ring" opacity="0.14" />
    <ellipse cx="640" cy="452" rx="312" ry="96" fill="none" :stroke="c.ring" stroke-width="14" opacity="0.45" transform="rotate(-14 640 452)" />

    <!-- ears (poke above the mane) -->
    <path d="M556 332 Q546 268 592 296 Q606 320 600 356 Z" :fill="c.coat" />
    <path d="M560 330 Q556 296 586 308 Q594 324 592 348 Z" :fill="c.ear" />
    <path d="M724 332 Q734 268 688 296 Q674 320 680 356 Z" :fill="c.coat" />
    <path d="M720 330 Q724 296 694 308 Q686 324 688 348 Z" :fill="c.ear" />

    <!-- coat face -->
    <path
      d="M640 300 C 542 300 508 380 512 454 C 516 542 568 598 640 598 C 712 598 764 542 768 454 C 772 380 738 300 640 300 Z"
      :fill="c.coat"
    />
    <path d="M640 300 C 712 300 766 382 768 454 C 764 542 712 598 640 598 C 690 560 706 470 700 410 C 694 352 672 318 640 300 Z" :fill="c.coatShade" opacity="0.35" />

    <!-- blush -->
    <ellipse cx="566" cy="506" rx="22" ry="13" fill="#ff7eb0" opacity="0.28" />
    <ellipse cx="714" cy="506" rx="22" ry="13" fill="#ff7eb0" opacity="0.28" />

    <!-- eyes -->
    <g>
      <ellipse cx="602" cy="456" rx="33" ry="44" fill="#ffffff" />
      <ellipse cx="604" cy="464" rx="27" ry="37" :fill="c.eye" />
      <ellipse cx="604" cy="470" rx="12" ry="18" fill="#241c3a" />
      <circle cx="593" cy="452" r="9" fill="#ffffff" />
      <circle cx="613" cy="478" r="4.5" fill="#ffffff" opacity="0.85" />
      <path d="M570 434 Q602 414 636 436" fill="none" stroke="#3a2f4a" stroke-width="5" stroke-linecap="round" />
      <path d="M570 434 Q558 428 550 432" fill="none" stroke="#3a2f4a" stroke-width="4.5" stroke-linecap="round" />
    </g>
    <g>
      <ellipse cx="678" cy="456" rx="33" ry="44" fill="#ffffff" />
      <ellipse cx="676" cy="464" rx="27" ry="37" :fill="c.eye" />
      <ellipse cx="676" cy="470" rx="12" ry="18" fill="#241c3a" />
      <circle cx="667" cy="452" r="9" fill="#ffffff" />
      <circle cx="687" cy="478" r="4.5" fill="#ffffff" opacity="0.85" />
      <path d="M710 434 Q678 414 644 436" fill="none" stroke="#3a2f4a" stroke-width="5" stroke-linecap="round" />
      <path d="M710 434 Q722 428 730 432" fill="none" stroke="#3a2f4a" stroke-width="4.5" stroke-linecap="round" />
    </g>

    <!-- muzzle -->
    <ellipse cx="628" cy="540" rx="3.4" ry="2.4" fill="#9a6a7a" opacity="0.55" />
    <ellipse cx="652" cy="540" rx="3.4" ry="2.4" fill="#9a6a7a" opacity="0.55" />
    <path d="M620 556 Q640 570 660 556" fill="none" stroke="#9a6a7a" stroke-width="3.4" stroke-linecap="round" />

    <!-- ===== bespoke manes ===== -->

    <!-- Twilight: straight indigo bangs with magenta + violet streaks -->
    <g v-if="skin === 'twilight'">
      <path d="M506 372 Q500 446 520 524 Q536 470 528 398 Z" fill="#3a2f7a" />
      <path d="M774 372 Q780 446 760 524 Q544 470 552 398 Z" fill="#3a2f7a" opacity="0" />
      <path d="M774 372 Q780 446 760 524 Q744 470 752 398 Z" fill="#3a2f7a" />
      <path
        d="M512 366 Q536 296 640 292 Q744 296 768 366 Q742 380 706 366 L694 402 L662 366 L636 404 L606 366 L576 400 L562 366 Q536 380 512 366 Z"
        fill="#3a2f7a"
      />
      <path d="M636 404 L662 366 L676 372 L650 402 Z" fill="#e84fa0" />
      <path d="M606 366 L576 400 L588 404 L612 368 Z" fill="#6c4fd0" />
      <path d="M520 360 Q540 320 600 312" fill="none" stroke="#e84fa0" stroke-width="5" stroke-linecap="round" opacity="0.85" />
    </g>

    <!-- Rainbow Dash: spiky rainbow mane -->
    <g v-else-if="skin === 'rainbow'">
      <path d="M508 368 Q500 448 522 528 Q540 472 530 398 Z" fill="#e23b3b" />
      <path d="M772 368 Q780 448 758 528 Q740 472 750 398 Z" fill="#8b5fd0" />
      <path d="M512 364 Q532 300 640 294 Q748 300 768 364 L734 348 L724 384 L700 350 L688 390 L660 352 L648 392 L620 352 L606 390 L584 350 L572 386 L548 348 L536 384 L512 364 Z" fill="#e23b3b" />
      <path d="M512 364 Q536 318 640 312 Q744 318 768 364 L740 352 L660 350 L572 352 L512 364 Z" fill="#f08a2a" />
      <path d="M520 356 Q546 322 640 318 Q734 322 760 356 L700 346 L600 346 L520 356 Z" fill="#f4d23f" />
      <path d="M532 350 Q556 326 640 322 Q724 326 748 350 L680 342 L600 342 L532 350 Z" fill="#4bbf5a" />
      <path d="M548 344 Q572 328 640 326 Q708 328 732 344 L660 340 L548 344 Z" fill="#3f9be8" />
      <path d="M566 340 Q600 330 640 330 Q680 330 714 340 L640 336 Z" fill="#8b5fd0" />
    </g>

    <!-- Pinkie Pie: poofy magenta curls -->
    <g v-else-if="skin === 'pinkie'">
      <circle cx="520" cy="404" r="44" fill="#e8489a" />
      <circle cx="500" cy="472" r="36" fill="#e8489a" />
      <circle cx="760" cy="404" r="44" fill="#e8489a" />
      <circle cx="780" cy="472" r="36" fill="#e8489a" />
      <circle cx="548" cy="338" r="48" fill="#e8489a" />
      <circle cx="606" cy="312" r="50" fill="#e8489a" />
      <circle cx="672" cy="312" r="50" fill="#e8489a" />
      <circle cx="732" cy="338" r="48" fill="#e8489a" />
      <circle cx="640" cy="324" r="40" fill="#e8489a" />
      <circle cx="600" cy="318" r="16" fill="#f49ac8" opacity="0.7" />
      <circle cx="676" cy="320" r="14" fill="#f49ac8" opacity="0.7" />
      <circle cx="540" cy="350" r="13" fill="#f49ac8" opacity="0.7" />
    </g>

    <!-- Applejack: blonde mane + cowboy hat -->
    <g v-else-if="skin === 'applejack'">
      <path d="M512 372 Q502 452 524 532 Q544 470 532 400 Z" fill="#f4d77a" />
      <path d="M768 372 Q778 452 756 532 Q738 470 748 400 Z" fill="#f4d77a" />
      <path d="M520 372 Q544 332 640 330 Q700 330 736 356 Q700 360 660 354 Q620 352 596 372 Q558 360 520 372 Z" fill="#f4d77a" />
      <path d="M520 366 Q548 338 612 336" fill="none" stroke="#e2c25e" stroke-width="4" stroke-linecap="round" opacity="0.7" />
      <ellipse cx="640" cy="332" rx="150" ry="30" fill="#c98a4a" />
      <path d="M548 336 Q556 268 640 264 Q724 268 732 336 Q686 316 640 316 Q594 316 548 336 Z" fill="#d99a52" />
      <path d="M548 332 Q640 352 732 332" fill="none" stroke="#a86a30" stroke-width="9" stroke-linecap="round" />
      <ellipse cx="640" cy="298" rx="84" ry="20" fill="#a86a30" opacity="0.35" />
    </g>

    <!-- Rarity: sculpted royal-purple curl -->
    <g v-else-if="skin === 'rarity'">
      <path d="M512 372 Q500 452 520 536 Q540 474 530 398 Z" fill="#5b3f9e" />
      <path d="M768 360 Q784 440 762 528 Q740 524 742 470 Q700 500 706 430 Q760 410 752 356 Z" fill="#5b3f9e" />
      <path
        d="M512 366 Q520 300 612 294 Q712 290 742 344 Q756 388 720 410 Q686 426 660 404 Q700 392 694 356 Q686 322 632 326 Q566 332 560 392 Q536 376 512 366 Z"
        fill="#5b3f9e"
      />
      <path d="M520 358 Q548 312 612 308 Q690 306 716 348" fill="none" stroke="#7a5cc0" stroke-width="7" stroke-linecap="round" opacity="0.75" />
      <path d="M700 404 Q726 396 730 366" fill="none" stroke="#4a3186" stroke-width="5" stroke-linecap="round" />
    </g>

    <!-- Fluttershy: long soft-pink draped mane -->
    <g v-else-if="skin === 'fluttershy'">
      <path d="M508 360 Q494 470 506 580 Q540 540 540 470 Q548 408 568 380 Q536 364 508 360 Z" fill="#f6a8c8" />
      <path d="M772 360 Q786 470 774 580 Q740 540 740 470 Q732 408 712 380 Q744 364 772 360 Z" fill="#f6a8c8" />
      <path d="M512 372 Q532 304 640 300 Q748 304 768 372 Q742 360 706 366 Q668 344 640 372 Q612 344 574 366 Q538 360 512 372 Z" fill="#f6a8c8" />
      <path d="M524 366 Q548 326 626 322" fill="none" stroke="#fbc7dd" stroke-width="7" stroke-linecap="round" opacity="0.75" />
      <path d="M512 372 Q506 452 514 520" fill="none" stroke="#e588b0" stroke-width="5" stroke-linecap="round" opacity="0.7" />
      <path d="M768 372 Q774 452 766 520" fill="none" stroke="#e588b0" stroke-width="5" stroke-linecap="round" opacity="0.7" />
    </g>
  </g>
</template>
