# v241 causal buy explanation

- Fixed the v240 issue where each buy line had its own accordion but still showed the old generic explanation.
- Each buy line now uses its saved `dominantBranchId` to resolve the corresponding prediction explanation.
- The user-facing explanation includes the reason for the lead/initiative scenario when available, then the exact FIRST/SECOND/THIRD node conditions saved on that buy line.
- Main/Cover/Buyable High classification wording is added only after the causal scenario, so classification does not masquerade as prediction evidence.
- No prediction, purchase, probability, odds, or funding logic was changed.
