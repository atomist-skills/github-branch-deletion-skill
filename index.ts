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

import { gitHubResourceProvider, slackResourceProvider } from "@atomist/skill/lib/resource_providers";
import { ParameterType, repoFilter, skill } from "@atomist/skill/lib/skill";
import { DeleteBranchConfiguration } from "./lib/events/deleteBranchOnPullRequest";

export const Skill = skill<DeleteBranchConfiguration & { repos: any }>({
    runtime: {
        memory: 1024,
        timeout: 540,
    },

    resourceProviders: {
        github: gitHubResourceProvider({ minRequired: 1 }),
        slack: slackResourceProvider({ minRequired: 0 }),
    },

    parameters: {
        deleteOn: {
            type: ParameterType.SingleChoice,
            displayName: "Default auto-deletion policy",
            description: "Branch deletion policy to apply when no explicit label is configured on a pull request",
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
        repos: repoFilter({ required: false }),
    },

    subscriptions: ["file://graphql/subscription/*.graphql"],
});
