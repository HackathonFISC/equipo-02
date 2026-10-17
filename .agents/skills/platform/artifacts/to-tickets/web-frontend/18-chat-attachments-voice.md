# Add CV attachments and voice input to the chat

**Issue:** #50

**Owner:** MateoDG2006  
**Parent spec:** #32  
**Labels:** `ready-for-agent`  
**Metadata:** work_type=Ticket; repo_scope=web; phase=build; priority=medium; risk=medium; sprint=hackathon  
**Docs:** [Profile phase (slot 1)](https://github.com/HackathonFISC/equipo-02/blob/docs/frontend-spec/docs/reference/frontend/ux-flows.md#profile-phase) · [Screen S2](https://github.com/HackathonFISC/equipo-02/blob/docs/frontend-spec/docs/reference/frontend/screens.md#s2--chat-chat) · [Spec (AC-04–AC-07)](https://github.com/HackathonFISC/equipo-02/blob/docs/frontend-spec/docs/reference/frontend/spec.md)

## Context
Completes G1 input modes. The CV is sent to `/api/intake` as soon as it is attached; the server merge from #34 combines it with the chat transcript.

## Acceptance Criteria
- [ ] The attach control accepts one PDF (`application/pdf`) or one image (`image/*`) up to 10 MB; larger or wrong-type files show the specified Spanish messages and are not sent (AC-04).
- [ ] An attached file shows an `AttachmentChip` with name, size, and remove; on send it goes to `/api/intake` with the session candidate, and profile slots are re-evaluated so only gaps are asked (AC-07).
- [ ] In browsers with `SpeechRecognition` or `webkitSpeechRecognition`, the mic transcribes (`es-PA`, fallback `es-419`) into the input for review (AC-05); otherwise the mic is not rendered (AC-06).
- [ ] Mic permission denial shows "No tengo permiso para usar el micrófono. Puedes escribir tu respuesta." and focuses the input.
- [ ] When every answer in the profile phase came from voice, the transcript intake uses `kind: "audio_transcript"`.

## Validation
Component tests with mocked `SpeechRecognition` and file inputs. e2e: attach the PDF fixture, then finish by chat; the profile contains items from both sources.

## Blocked By
- #49 — Build the welcome screen and the chat UI from profile capture to first exploration
- #34 — Merge multiple intake sources into one candidate profile on the server

## Risks
Speech support varies on iOS (R3); feature detection keeps typing as the always-available path.
