/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
	Category,
	parameter,
	ParameterType,
	ParameterVisibility,
	resourceProvider,
	skill,
} from "@atomist/skill";
import { DeleteBranchConfiguration } from "./lib/configuration";

export const Skill = skill<
	DeleteBranchConfiguration & { repos: any; schedule: any }
>({
	name: "github-branch-deletion-skill",
	namespace: "atomist",
	displayName: "Auto-Delete Branches",
	author: "Atomist",
	categories: [Category.CodeReview, Category.DevEx],
	license: "Apache-2.0",

	runtime: {
		memory: 1024,
		timeout: 540,
	},

	resourceProviders: {
		github: resourceProvider.gitHub({ minRequired: 1 }),
		slack: resourceProvider.chat({ minRequired: 0 }),
	},

	parameters: {
		deleteOn: {
			type: ParameterType.SingleChoice,
			displayName: "Default auto-deletion policy",
			description:
				"Branch deletion policy to apply when no explicit label is configured on a pull request",
			options: [
				{
					text: "On pull request merge",
					value: "on-merge",
				},
				{
					text: "On pull request close or merge",
					value: "on-close",
				},
			],
			defaultValue: "on-merge",
			required: false,
		},
		staleList: {
			type: ParameterType.Boolean,
			displayName: "List stale branches",
			description: "Find and list stale branches in repositories",
			defaultValue: true,
			required: false,
		},
		staleThreshold: {
			type: ParameterType.Int,
			displayName: "Stale branch threshold",
			description: "Number of days after which a branch is marked stale",
			defaultValue: 7,
			required: false,
		},
		staleExcludes: {
			type: ParameterType.StringArray,
			displayName: "Exclude branches",
			description:
				"Regular expression patterns for branches that should not get reported. The expression is matched against `owner/repository#branch`.",
			required: false,
		},
		repos: parameter.repoFilter({ required: false }),
		schedule: {
			type: ParameterType.Schedule,
			displayName: "Process branches",
			defaultValue: "0 8 * * *",
			description: "Cron expression to process stale branches",
			required: false,
			visibility: ParameterVisibility.Hidden,
		},
	},

	subscriptions: ["file://graphql/subscription/*.graphql"],
});
