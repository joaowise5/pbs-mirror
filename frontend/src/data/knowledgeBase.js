/*
 * SAMPLE knowledge base for the prototype.
 *
 * Everything here is placeholder content written to exercise the UI. It is NOT
 * verified PBS / PBS Wisconsin policy. In the real build, `sources` comes from the
 * ingestion pipeline and `entries` are replaced by retrieved chunks from the vector store.
 */
export const KB = {
  categories: ['PBS Passport', 'Devices', 'Live TV', 'Accounts & membership'],

  sources: [
    { id: 'S1', title: 'PBS Passport Help Center FAQ', type: 'Web', origin: 'help.pbs.org (crawled)', url: 'https://help.pbs.org/support/solutions/5000121793', owner: 'PBS', updated: '2026-10-02', chunks: 48 },
    { id: 'S2', title: 'Passport Activation & Account Linking Guide', type: 'PDF', origin: 'Audience Services shared drive', owner: 'Audience Services', updated: '2026-09-18', chunks: 22 },
    { id: 'S3', title: 'Supported Devices Matrix: Fall 2026', type: 'PDF', origin: 'Digital team', owner: 'Digital', updated: '2026-10-09', chunks: 31 },
    { id: 'S4', title: 'Ways to Watch PBS Wisconsin', type: 'Web', origin: 'pbswisconsin.org (crawled)', url: 'https://pbswisconsin.org/watch-page/', owner: 'Web', updated: '2026-08-27', chunks: 17 },
    { id: 'S5', title: 'Audience Services Call Handling Playbook', type: 'Doc', origin: 'Internal wiki', owner: 'Audience Services', updated: '2026-07-30', chunks: 39 },
    { id: 'S6', title: 'Livestream Rights & Blackout Notes', type: 'Doc', origin: 'Programming', owner: 'Programming', updated: '2026-10-06', chunks: 9 },
    { id: 'S7', title: 'Membership & Renewal Policy', type: 'PDF', origin: 'Membership team', owner: 'Membership', updated: '2026-06-12', chunks: 14 },
  ],

  entries: [
    {
      id: 'passport-what',
      category: 'PBS Passport',
      question: 'What is PBS Wisconsin Passport?',
      keywords: ['passport', 'benefit', 'library', 'extended', 'qualify', 'eligible', 'cost', 'price', 'what is passport'],
      summary: 'Passport is a member benefit that gives PBS Wisconsin donors extended on-demand access to a library of PBS and PBS Wisconsin programs, including past seasons and some early releases.',
      details: [
        'Eligibility comes from a qualifying gift to PBS Wisconsin (annual or sustaining monthly).',
        'Members watch on pbswisconsin.org, pbs.org, and the PBS App.',
        'Passport is tied to the member’s PBS Account, not to a device.',
      ],
      note: 'Giving thresholds are set by the station. Confirm the current amount in the Membership policy before quoting it.',
      citations: [
        { sourceId: 'S1', excerpt: 'PBS Passport is a member benefit that provides extended access to an on-demand library of quality public television programming.' },
        { sourceId: 'S7', excerpt: 'Donors who make a qualifying annual gift, or who give monthly as sustaining members, are eligible for Passport for the duration of their membership.' },
      ],
    },
    {
      id: 'passport-activate',
      category: 'PBS Passport',
      question: 'How does a member activate Passport?',
      keywords: ['activate', 'activation', 'passport', 'code', 'start', 'set up', 'setup', 'redeem', 'how to activate'],
      summary: 'New members activate Passport from the welcome email using a one-time activation code, then sign in to a PBS Account.',
      steps: [
        'Find the Passport activation email from PBS Wisconsin.',
        'Select Activate in the email, or open the activation page it links to and enter the activation code.',
        'Sign in to (or create) a PBS Account. Google, Apple, and email sign-in all work.',
        'Once signed in, Passport videos show as unlocked.',
      ],
      note: 'Activation codes are single-use. Once redeemed, Passport stays attached to whichever PBS Account used the code.',
      citations: [
        { sourceId: 'S2', excerpt: 'Each activation code may be redeemed once. The code links the member record to the PBS Account the viewer is signed in to at redemption.' },
        { sourceId: 'S1', excerpt: 'To activate, follow the link in your welcome email and sign in or create a PBS Account.' },
      ],
    },
    {
      id: 'passport-no-email',
      category: 'PBS Passport',
      question: 'A member never received their Passport activation email',
      keywords: ['email', 'received', 'never', 'lost', 'missing', 'resend', 'spam', 'junk', 'didnt get', 'never got', 'cant find'],
      summary: 'Confirm the gift qualifies and the email on file is correct, then resend the activation email from the member record.',
      steps: [
        'Ask the member to check spam/junk folders for mail from PBS Wisconsin.',
        'Look the member up in the donor database by name, email, or phone and confirm the gift qualifies.',
        'Verify the email address on file and correct it if needed.',
        'Resend the activation email from the member record.',
      ],
      note: 'If the record shows the code was already redeemed, the member likely activated on a different PBS Account. See "Passport was activated on the wrong account."',
      citations: [
        { sourceId: 'S5', excerpt: 'Missing activation email: verify gift, verify email on file, check spam, then resend from the member record. Do not read activation codes aloud over the phone.' },
        { sourceId: 'S2', excerpt: 'Resending generates a new email containing the same unredeemed code. Redeemed codes cannot be resent.' },
      ],
    },
    {
      id: 'passport-wrong-account',
      category: 'PBS Passport',
      question: 'Passport was activated on the wrong account',
      keywords: ['wrong', 'different', 'another', 'already', 'redeemed', 'used', 'transfer', 'move', 'switch', 'wrong account', 'already used'],
      summary: 'Unlink the activation from the member record in the membership admin tool, then send a fresh activation email so the member can activate on the right PBS Account.',
      steps: [
        'Confirm which PBS Account the member wants to use (and how they sign in to it).',
        'In the membership admin tool, open the member record and unlink the current PBS Account.',
        'Resend the activation email and stay on the line while they activate, if possible.',
      ],
      citations: [
        { sourceId: 'S2', excerpt: 'Staff may unlink a PBS Account from a membership record. After unlinking, a new activation email can be sent to the member.' },
      ],
    },
    {
      id: 'passport-locked',
      category: 'PBS Passport',
      question: 'Member activated Passport but videos are still locked',
      keywords: ['locked', 'lock', 'still', 'not working', 'cant watch', 'unavailable', 'activated', 'error', 'wont play', 'still locked'],
      summary: 'Locked videos after activation usually mean the member is signed out or signed in to a different PBS Account than the one they activated with.',
      steps: [
        'Confirm they are signed in on the device they’re using.',
        'Ask which sign-in method they used at activation. Google, Apple, and email each create a separate PBS Account.',
        'Check that their station is set to PBS Wisconsin.',
        'Sign out and back in. On TVs, unlink and re-link the device at pbs.org/activate.',
        'If it still fails, check the donor record. Passport ends when membership lapses.',
      ],
      citations: [
        { sourceId: 'S1', excerpt: 'If Passport videos appear locked, make sure you are signed in with the same account you used to activate Passport.' },
        { sourceId: 'S5', excerpt: 'Most "still locked" calls are a sign-in method mismatch (e.g., activated with Google, now signing in with email).' },
      ],
    },
    {
      id: 'passport-devices',
      category: 'Devices',
      question: 'Which devices support Passport?',
      keywords: ['device', 'devices', 'support', 'supported', 'compatible', 'work on', 'platform', 'phone', 'tablet', 'ipad', 'iphone', 'android', 'chromecast', 'airplay'],
      summary: 'Passport works anywhere the member can sign in to the PBS App or pbs.org / pbswisconsin.org.',
      details: [
        'Web: pbswisconsin.org and pbs.org in current browsers.',
        'Mobile: PBS App for iPhone/iPad and Android.',
        'TV: Roku, Apple TV, Amazon Fire TV, Android TV / Google TV, Samsung Smart TV, Vizio SmartCast.',
        'Casting: Chromecast and AirPlay from the PBS App.',
      ],
      note: 'Older devices may fall below the minimum OS version. Check the Devices Matrix before troubleshooting further.',
      citations: [
        { sourceId: 'S3', excerpt: 'Supported: Roku (OS 11+), Apple TV (tvOS 16+), Fire TV, Android/Google TV, Samsung Tizen 2019+, Vizio SmartCast, iOS 16+, Android 9+.' },
      ],
    },
    {
      id: 'passport-tv-setup',
      category: 'Devices',
      question: 'How do I set up Passport on Roku, Apple TV, or a smart TV?',
      keywords: ['roku', 'apple tv', 'fire tv', 'firestick', 'smart tv', 'samsung', 'vizio', 'tv', 'television', 'link', 'sign in on tv', 'pbs.org/activate'],
      summary: 'Members link a TV device to their PBS Account using a short code shown on screen.',
      steps: [
        'Install the PBS App from the device’s app/channel store and open it.',
        'Choose Sign In. The TV displays a short device code.',
        'On a phone or computer, go to pbs.org/activate, sign in to the same PBS Account used for Passport, and enter the code.',
        'The TV refreshes within a few seconds. Confirm the station is set to PBS Wisconsin in the app settings.',
      ],
      note: 'The on-screen TV code is not the Passport activation code from the welcome email. Callers mix these up often.',
      citations: [
        { sourceId: 'S3', excerpt: 'TV platforms use device linking: the app displays a code that the viewer enters at pbs.org/activate.' },
        { sourceId: 'S2', excerpt: 'Device link codes expire after a few minutes and are separate from Passport activation codes.' },
      ],
    },
    {
      id: 'live-online',
      category: 'Live TV',
      question: 'How can viewers watch PBS Wisconsin live online?',
      keywords: ['live', 'livestream', 'stream', 'online', 'broadcast', 'real time', 'watch live', 'live tv'],
      summary: 'The PBS Wisconsin livestream is free and doesn’t require Passport. Viewers can watch it on pbswisconsin.org or in the PBS App.',
      details: [
        'Web: the Live TV page on pbswisconsin.org.',
        'PBS App: the Live TV tab, with the station set to PBS Wisconsin.',
        'Availability is based on the viewer’s location within the service area.',
      ],
      citations: [
        { sourceId: 'S4', excerpt: 'Stream PBS Wisconsin live for free on our website and in the PBS App. No membership required.' },
        { sourceId: 'S6', excerpt: 'Livestream access is geo-restricted to the station service area.' },
      ],
    },
    {
      id: 'live-blackout',
      category: 'Live TV',
      question: 'Why is a program unavailable on the livestream?',
      keywords: ['blackout', 'blacked', 'unavailable', 'not available', 'slate', 'rights', 'blocked', 'vpn', 'outside', 'traveling', 'missing'],
      summary: 'Some programs aren’t licensed for streaming. During those time slots the livestream shows a "not available" slate while the over-the-air broadcast continues.',
      steps: [
        'Check the schedule for streaming-rights restrictions on that program.',
        'If the viewer is traveling or on a VPN, location detection may place them outside the service area. Ask them to turn off the VPN.',
        'Point them to over-the-air, cable, or satellite for restricted programs.',
      ],
      citations: [
        { sourceId: 'S6', excerpt: 'Programs without digital rights are replaced on the stream by a standard slate. Broadcast is unaffected.' },
        { sourceId: 'S4', excerpt: 'Some programs may not be available to stream due to rights restrictions.' },
      ],
    },
    {
      id: 'live-antenna',
      category: 'Live TV',
      question: 'A viewer lost the channel on their antenna or cable',
      keywords: ['antenna', 'over the air', 'ota', 'cable', 'satellite', 'channel', 'rescan', 'scan', 'signal', 'reception', 'lost channel'],
      summary: 'Start with a channel rescan, then confirm which PBS Wisconsin channel serves the viewer’s area.',
      steps: [
        'Have the viewer rescan channels (TV Settings → Channels → Auto scan).',
        'Check the Ways to Watch page for the channel that serves their region.',
        'For ongoing reception issues, log their ZIP code and route the ticket to Engineering.',
      ],
      citations: [
        { sourceId: 'S4', excerpt: 'If you’ve lost our signal, try rescanning your TV. Find your local channel on the Ways to Watch page.' },
        { sourceId: 'S5', excerpt: 'Reception complaints: capture ZIP code and antenna type; escalate repeated reports to Engineering.' },
      ],
    },
    {
      id: 'account-signin',
      category: 'Accounts & membership',
      question: 'Viewer forgot which email or sign-in they used',
      keywords: ['forgot', 'password', 'sign in', 'login', 'log in', 'account', 'google', 'apple', 'reset', 'which email'],
      summary: 'Help them figure out which sign-in method they used. Each method (Google, Apple, email) creates a separate PBS Account.',
      steps: [
        'Ask which methods they might have used: Google, Apple, or email/password.',
        'For email accounts, use "Forgot password" on the PBS sign-in page.',
        'Apple "Hide My Email" sign-ins use a relay address. Check the donor record for an @privaterelay.appleid.com email.',
        'Once signed in, confirm Passport shows under My Account.',
      ],
      citations: [
        { sourceId: 'S1', excerpt: 'Your PBS Account can be created with Google, Apple, or an email address. These are separate accounts.' },
        { sourceId: 'S5', excerpt: 'Apple relay addresses frequently cause "I don’t recognize this email" confusion; search the donor record by name.' },
      ],
    },
    {
      id: 'membership-expire',
      category: 'Accounts & membership',
      question: 'When does Passport expire, and how do members renew?',
      keywords: ['expire', 'expired', 'expiration', 'renew', 'renewal', 'lapse', 'lapsed', 'sustainer', 'sustaining', 'monthly', 'annual'],
      summary: 'Passport stays active while membership is current. Annual members keep access for 12 months after their qualifying gift. Sustaining (monthly) members keep it as long as their monthly gift continues.',
      steps: [
        'Check the donor record for the last gift date and membership expiration.',
        'Offer renewal, or a switch to sustaining membership to avoid future lapses.',
      ],
      note: 'Payment updates and refunds go to the Membership team. Audience Services shouldn’t process billing changes.',
      citations: [
        { sourceId: 'S7', excerpt: 'Annual membership benefits extend 12 months from the qualifying gift date. Sustaining memberships remain active while payments continue.' },
        { sourceId: 'S5', excerpt: 'Route payment method changes and refund requests to Membership. Do not take card numbers on Audience Services lines.' },
      ],
    },
    {
      id: 'passport-share',
      category: 'Accounts & membership',
      question: 'Can members share Passport with family?',
      keywords: ['share', 'sharing', 'family', 'household', 'spouse', 'wife', 'husband', 'partner', 'kids', 'parents', 'multiple', 'how many', 'second account'],
      summary: 'Passport is tied to one PBS Account. Members can sign in to that account on multiple devices in their household, but the benefit can’t be split across separate PBS Accounts.',
      citations: [
        { sourceId: 'S1', excerpt: 'Passport is linked to a single PBS Account. You can sign in on multiple devices with that account.' },
      ],
    },
  ],
};
