KEIRIN-0.5.43-terminal-lifecycle-audit

Generated terminals are now protected by a lifecycle audit. Supported terminals cannot disappear between generation, probability evaluation and purchase evaluation. Purchase rejection requires a reason code and reason text. Generation exclusions are limited to explicit rule-impossible or data-contradiction reasons; duplicate terminal paths are merged, not deleted. A compact terminal ledger is saved with each prediction so post-result verification can distinguish "not generated" from "generated but not purchased".
