import { Injectable, Logger } from '@nestjs/common';
import {
  KantataCustomFieldValue,
  KantataFetchResult,
  KantataRole,
  KantataSkill,
  KantataSkillMembership,
  KantataSkillsResponse,
  KantataSkillsFetchResult,
  KantataUser,
  KantataUsersResponse,
  KantataUsersWithSkillsResponse,
  KantataUsersWithSkillsFetchResult,
  KantataStoriesResponse,
  KantataStoriesFetchResult,
  KantataStory,
  KantataWorkspace,
  KantataStoryAssignment,
  KantataAssignmentsResponse,
  KantataTimeOffEntry,
  KantataTimeOffResponse,
  KantataTimeOffFetchResult,
  KantataHoliday,
  KantataHolidaysResponse,
  KantataHolidaysFetchResult,
  KantataHolidayCalendar,
  KantataHolidayCalendarsResponse,
  KantataHolidayCalendarAssociation,
} from './types';

const DEFAULT_PER_PAGE = 100;

@Injectable()
export class KantataApiClient {
  private readonly logger = new Logger(KantataApiClient.name);

  /**
   * Fetch a single page of users from the Kantata API
   */
  async fetchUsersPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataUsersResponse> {
    const url = `${baseUrl}/users.json?consultants_only=true&on_my_account=true&optional_fields=email_address,full_name,bio,city,country,classification,photo_path&include=manager,role,custom_field_values&page=${page}&per_page=${perPage}`;

    this.logger.debug(`Fetching Kantata users page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataUsersResponse>;
  }

  /**
   * Fetch all users from the Kantata API with pagination
   */
  async fetchAllUsers(
    baseUrl: string,
    oauthToken: string,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataFetchResult> {
    const allUsers: KantataUser[] = [];
    const allRoles = new Map<string, KantataRole>();
    const allCustomFieldValues = new Map<string, KantataCustomFieldValue>();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchUsersPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
      );

      // Convert object-keyed users to array
      const users = response.users ? Object.values(response.users) : [];
      allUsers.push(...users);

      // Accumulate roles from each page
      if (response.roles) {
        for (const [id, role] of Object.entries(response.roles)) {
          allRoles.set(id, role);
        }
      }

      // Accumulate custom field values from each page
      if (response.custom_field_values) {
        for (const [id, cfv] of Object.entries(response.custom_field_values)) {
          allCustomFieldValues.set(id, cfv);
        }
      }

      this.logger.debug(
        `Fetched ${users.length} users from page ${page}, total so far: ${allUsers.length}`,
      );

      // If we got fewer users than requested, we've reached the end
      hasMore = users.length === perPage;
      page++;
    }

    this.logger.log(`Fetched ${allUsers.length} total users from Kantata`);
    return { users: allUsers, roles: allRoles, customFieldValues: allCustomFieldValues };
  }

  /**
   * Test the API connection by fetching a minimal response
   */
  async testConnection(
    baseUrl: string,
    oauthToken: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `${baseUrl}/users.json?per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${oauthToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return {
          success: false,
          message: `API returned ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        message: 'Connected to Kantata API',
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fetch a single page of skills from the Kantata API
   */
  async fetchSkillsPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataSkillsResponse> {
    const url = `${baseUrl}/skills.json?page=${page}&per_page=${perPage}`;

    this.logger.debug(`Fetching Kantata skills page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataSkillsResponse>;
  }

  /**
   * Fetch all skills from the Kantata API with pagination
   */
  async fetchAllSkills(
    baseUrl: string,
    oauthToken: string,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataSkillsFetchResult> {
    const allSkills: KantataSkill[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchSkillsPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
      );

      const skills = response.skills ? Object.values(response.skills) : [];
      allSkills.push(...skills);

      this.logger.debug(
        `Fetched ${skills.length} skills from page ${page}, total so far: ${allSkills.length}`,
      );

      hasMore = skills.length === perPage;
      page++;
    }

    this.logger.log(`Fetched ${allSkills.length} total skills from Kantata`);
    return { skills: allSkills };
  }

  /**
   * Fetch a single page of users with their skill memberships from the Kantata API
   */
  async fetchUsersWithSkillsPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataUsersWithSkillsResponse> {
    const url = `${baseUrl}/users.json?per_page=${perPage}&page=${page}&with_skill&include=skills,skill_memberships`;

    this.logger.debug(`Fetching Kantata users with skills page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataUsersWithSkillsResponse>;
  }

  /**
   * Fetch all users with their skill memberships from the Kantata API with pagination
   */
  async fetchAllUsersWithSkills(
    baseUrl: string,
    oauthToken: string,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataUsersWithSkillsFetchResult> {
    const allUsers: KantataUser[] = [];
    const allSkills = new Map<string, KantataSkill>();
    const allSkillMemberships: KantataSkillMembership[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchUsersWithSkillsPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
      );

      const users = response.users ? Object.values(response.users) : [];
      allUsers.push(...users);

      // Accumulate skills from each page
      if (response.skills) {
        for (const [id, skill] of Object.entries(response.skills)) {
          allSkills.set(id, skill);
        }
      }

      // Accumulate skill memberships from each page
      if (response.skill_memberships) {
        allSkillMemberships.push(...Object.values(response.skill_memberships));
      }

      this.logger.debug(
        `Fetched ${users.length} users with skills from page ${page}, total so far: ${allUsers.length}`,
      );

      hasMore = users.length === perPage;
      page++;
    }

    this.logger.log(
      `Fetched ${allUsers.length} users with ${allSkillMemberships.length} skill memberships from Kantata`,
    );
    return { users: allUsers, skills: allSkills, skillMemberships: allSkillMemberships };
  }

  /**
   * Fetch a single page of stories from the Kantata API
   */
  async fetchStoriesPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
    createdAfter?: string,
    updatedAfter?: string,
  ): Promise<KantataStoriesResponse> {
    let url = `${baseUrl}/stories.json?all_on_account=true&include=workspace,sub_stories,assignees,current_assignments&archived=include&page=${page}&per_page=${perPage}`;

    if (createdAfter) {
      url += `&created_after=${encodeURIComponent(createdAfter)}`;
    }
    if (updatedAfter) {
      url += `&updated_after=${encodeURIComponent(updatedAfter)}`;
    }

    this.logger.debug(`Fetching Kantata stories page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      this.logger.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`);
      await new Promise((resolve) =>
        setTimeout(resolve, Number.parseInt(retryAfter) * 1000),
      );
      return this.fetchStoriesPage(baseUrl, oauthToken, page, perPage, createdAfter, updatedAfter);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataStoriesResponse>;
  }

  /**
   * Fetch all stories from the Kantata API with pagination
   * @param includeAssignments - If false, skips fetching assignments (useful for requests-only sync)
   */
  async fetchAllStories(
    baseUrl: string,
    oauthToken: string,
    perPage: number = 200,
    createdAfter?: string,
    updatedAfter?: string,
    includeAssignments: boolean = true,
  ): Promise<KantataStoriesFetchResult> {
    const allStories: KantataStory[] = [];
    const allWorkspaces: Record<string, KantataWorkspace> = {};
    const allUsers: Record<string, KantataUser> = {};
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchStoriesPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
        createdAfter,
        updatedAfter,
      );

      // Store workspaces and users from this page
      if (response.workspaces) {
        Object.assign(allWorkspaces, response.workspaces);
      }
      if (response.users) {
        Object.assign(allUsers, response.users);
      }

      // Collect stories from results
      const collectedStoryIds = new Set<string>();

      if (response.results && response.stories) {
        response.results.forEach((result) => {
          if (result.key === 'stories') {
            const story = response.stories![result.id];
            if (story) {
              allStories.push(story);
              collectedStoryIds.add(story.id);
            }
          }
        });
      }

      // Also collect sub_stories that are in the stories object but not in results
      if (response.stories) {
        Object.entries(response.stories).forEach(([storyId, story]) => {
          if (!collectedStoryIds.has(storyId) && story) {
            allStories.push(story);
            collectedStoryIds.add(storyId);
          }
        });
      }

      const totalCount = response.count || 0;
      hasMore = allStories.length < totalCount;
      page++;

      this.logger.debug(
        `Fetched stories page ${page - 1}, total so far: ${allStories.length}/${totalCount}`,
      );

      if (hasMore) {
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.logger.log(`Fetched ${allStories.length} total stories from Kantata`);

    // Fetch assignments only if requested
    let allAssignments: Record<string, KantataStoryAssignment> = {};
    if (includeAssignments) {
      allAssignments = await this.fetchAllAssignments(baseUrl, oauthToken, allUsers, 200, createdAfter);
    }

    return {
      stories: allStories,
      workspaces: allWorkspaces,
      users: allUsers,
      assignments: allAssignments,
    };
  }

  /**
   * Fetch a single page of assignments from the Kantata API
   */
  async fetchAssignmentsPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
    createdAfter?: string,
    updatedAfter?: string,
  ): Promise<KantataAssignmentsResponse> {
    let url = `${baseUrl}/assignments.json?all_on_account=true&include=assignee,story&in_unarchived_workspaces=false&in_unarchived_stories=false&page=${page}&per_page=${perPage}`;

    if (createdAfter) {
      url += `&created_after=${encodeURIComponent(createdAfter)}`;
    }
    if (updatedAfter) {
      url += `&updated_after=${encodeURIComponent(updatedAfter)}`;
    }

    this.logger.debug(`Fetching Kantata assignments page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      this.logger.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`);
      await new Promise((resolve) =>
        setTimeout(resolve, Number.parseInt(retryAfter) * 1000),
      );
      return this.fetchAssignmentsPage(baseUrl, oauthToken, page, perPage, createdAfter, updatedAfter);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataAssignmentsResponse>;
  }

  /**
   * Fetch all assignments from the Kantata API with pagination
   */
  async fetchAllAssignments(
    baseUrl: string,
    oauthToken: string,
    existingUsers: Record<string, KantataUser>,
    perPage: number = 200,
    createdAfter?: string,
    updatedAfter?: string,
  ): Promise<Record<string, KantataStoryAssignment>> {
    const allAssignments: Record<string, KantataStoryAssignment> = {};
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.fetchAssignmentsPage(
          baseUrl,
          oauthToken,
          page,
          perPage,
          createdAfter,
          updatedAfter,
        );

        if (response.assignments) {
          Object.assign(allAssignments, response.assignments);
        }
        if (response.users) {
          Object.assign(existingUsers, response.users);
        }

        const totalCount = response.count || 0;
        const fetchedCount = Object.keys(allAssignments).length;
        hasMore = fetchedCount < totalCount;
        page++;

        this.logger.debug(
          `Fetched assignments page ${page - 1}, total so far: ${fetchedCount}/${totalCount}`,
        );

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch assignments: ${error instanceof Error ? error.message : String(error)}`,
        );
        hasMore = false;
      }
    }

    this.logger.log(
      `Fetched ${Object.keys(allAssignments).length} total assignments from Kantata`,
    );
    return allAssignments;
  }

  /**
   * Fetch a single page of time off entries from the Kantata API
   */
  async fetchTimeOffEntriesPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
    createdAfter?: string,
  ): Promise<KantataTimeOffResponse> {
    let url = `${baseUrl}/time_off_entries.json?include=user&page=${page}&per_page=${perPage}`;

    if (createdAfter) {
      url += `&created_after=${encodeURIComponent(createdAfter)}`;
    }

    this.logger.debug(`Fetching Kantata time off entries page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      this.logger.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`);
      await new Promise((resolve) =>
        setTimeout(resolve, Number.parseInt(retryAfter) * 1000),
      );
      return this.fetchTimeOffEntriesPage(baseUrl, oauthToken, page, perPage, createdAfter);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataTimeOffResponse>;
  }

  /**
   * Extract time off entries from a paginated response
   */
  private collectTimeOffEntries(response: KantataTimeOffResponse): KantataTimeOffEntry[] {
    const entries: KantataTimeOffEntry[] = [];
    if (!response.results || !response.time_off_entries) {
      return entries;
    }
    for (const result of response.results) {
      if (result.key === 'time_off_entries') {
        const entry = response.time_off_entries[result.id];
        if (entry) {
          entries.push(entry);
        }
      }
    }
    return entries;
  }

  /**
   * Fetch all time off entries from the Kantata API with pagination
   */
  async fetchAllTimeOffEntries(
    baseUrl: string,
    oauthToken: string,
    perPage: number = DEFAULT_PER_PAGE,
    createdAfter?: string,
  ): Promise<KantataTimeOffFetchResult> {
    const allEntries: KantataTimeOffEntry[] = [];
    const allUsers: Record<string, KantataUser> = {};
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchTimeOffEntriesPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
        createdAfter,
      );

      // Collect entries from the results array
      allEntries.push(...this.collectTimeOffEntries(response));

      // Accumulate users
      if (response.users) {
        Object.assign(allUsers, response.users);
      }

      // Use meta-based pagination
      const { page_number, page_count } = response.meta;
      hasMore = page_number < page_count;
      page++;

      this.logger.debug(
        `Fetched time off entries page ${page_number}/${page_count}, total so far: ${allEntries.length}/${response.meta.count}`,
      );

      if (hasMore) {
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.logger.log(`Fetched ${allEntries.length} total time off entries from Kantata`);
    return { entries: allEntries, users: allUsers };
  }

  /**
   * Fetch a single page of holidays from the Kantata API
   */
  async fetchHolidaysPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataHolidaysResponse> {
    const url = `${baseUrl}/holidays.json?include=holiday_calendar_associations,holiday_calendars&page=${page}&per_page=${perPage}`;

    this.logger.debug(`Fetching Kantata holidays page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      this.logger.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`);
      await new Promise((resolve) =>
        setTimeout(resolve, Number.parseInt(retryAfter) * 1000),
      );
      return this.fetchHolidaysPage(baseUrl, oauthToken, page, perPage);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataHolidaysResponse>;
  }

  /**
   * Fetch a single page of holiday calendars from the Kantata API
   */
  async fetchHolidayCalendarsPage(
    baseUrl: string,
    oauthToken: string,
    page: number,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataHolidayCalendarsResponse> {
    const url = `${baseUrl}/holiday_calendars.json?include=users&page=${page}&per_page=${perPage}`;

    this.logger.debug(`Fetching Kantata holiday calendars page ${page}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      this.logger.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`);
      await new Promise((resolve) =>
        setTimeout(resolve, Number.parseInt(retryAfter) * 1000),
      );
      return this.fetchHolidayCalendarsPage(baseUrl, oauthToken, page, perPage);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Kantata API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json() as Promise<KantataHolidayCalendarsResponse>;
  }

  /**
   * Extract holiday calendars from a paginated response
   */
  private collectHolidayCalendars(response: KantataHolidayCalendarsResponse): KantataHolidayCalendar[] {
    const calendars: KantataHolidayCalendar[] = [];
    if (!response.results || !response.holiday_calendars) {
      return calendars;
    }
    for (const result of response.results) {
      if (result.key === 'holiday_calendars') {
        const calendar = response.holiday_calendars[result.id];
        if (calendar) {
          calendars.push(calendar);
        }
      }
    }
    return calendars;
  }

  /**
   * Fetch all holiday calendars from the Kantata API with pagination
   */
  async fetchAllHolidayCalendars(
    baseUrl: string,
    oauthToken: string,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<Map<string, KantataHolidayCalendar>> {
    const allCalendars = new Map<string, KantataHolidayCalendar>();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchHolidayCalendarsPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
      );

      // Collect calendars from the results array
      for (const calendar of this.collectHolidayCalendars(response)) {
        allCalendars.set(calendar.id, calendar);
      }

      // Use meta-based pagination
      const { page_number, page_count } = response.meta;
      hasMore = page_number < page_count;
      page++;

      this.logger.debug(
        `Fetched holiday calendars page ${page_number}/${page_count}, total so far: ${allCalendars.size}/${response.meta.count}`,
      );

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.logger.log(`Fetched ${allCalendars.size} total holiday calendars from Kantata`);
    return allCalendars;
  }

  /**
   * Extract holidays from a paginated response
   */
  private collectHolidays(response: KantataHolidaysResponse): KantataHoliday[] {
    const holidays: KantataHoliday[] = [];
    if (!response.results || !response.holidays) {
      return holidays;
    }
    for (const result of response.results) {
      if (result.key === 'holidays') {
        const holiday = response.holidays[result.id];
        if (holiday) {
          holidays.push(holiday);
        }
      }
    }
    return holidays;
  }

  /**
   * Build a mapping of holiday ID to array of calendar IDs from associations
   */
  private buildHolidayCalendarIdsMapping(
    associations: KantataHolidayCalendarAssociation[],
  ): Map<string, string[]> {
    const holidayCalendarIds = new Map<string, string[]>();
    for (const assoc of associations) {
      if (!holidayCalendarIds.has(assoc.holiday_id)) {
        holidayCalendarIds.set(assoc.holiday_id, []);
      }
      holidayCalendarIds.get(assoc.holiday_id)!.push(assoc.holiday_calendar_id);
    }
    return holidayCalendarIds;
  }

  /**
   * Accumulate data from a holidays response into the provided collections
   */
  private accumulateHolidaysResponseData(
    response: KantataHolidaysResponse,
    allHolidays: KantataHoliday[],
    allCalendarAssociations: KantataHolidayCalendarAssociation[],
    allCalendars: Map<string, KantataHolidayCalendar>,
  ): void {
    allHolidays.push(...this.collectHolidays(response));

    if (response.holiday_calendar_associations) {
      allCalendarAssociations.push(
        ...Object.values(response.holiday_calendar_associations),
      );
    }

    if (response.holiday_calendars) {
      for (const calendar of Object.values(response.holiday_calendars)) {
        allCalendars.set(calendar.id, calendar);
      }
    }
  }

  /**
   * Fetch all holidays from the Kantata API with pagination
   */
  async fetchAllHolidays(
    baseUrl: string,
    oauthToken: string,
    perPage: number = DEFAULT_PER_PAGE,
  ): Promise<KantataHolidaysFetchResult> {
    const allHolidays: KantataHoliday[] = [];
    const allCalendarAssociations: KantataHolidayCalendarAssociation[] = [];
    const allCalendars = new Map<string, KantataHolidayCalendar>();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchHolidaysPage(
        baseUrl,
        oauthToken,
        page,
        perPage,
      );

      // Accumulate data from this page
      this.accumulateHolidaysResponseData(
        response,
        allHolidays,
        allCalendarAssociations,
        allCalendars,
      );

      // Use meta-based pagination
      const { page_number, page_count } = response.meta;
      hasMore = page_number < page_count;
      page++;

      this.logger.debug(
        `Fetched holidays page ${page_number}/${page_count}, total so far: ${allHolidays.length}/${response.meta.count}`,
      );

      if (hasMore) {
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Fetch all holiday calendars with their users (may have more detail than inline)
    const calendarsWithUsers = await this.fetchAllHolidayCalendars(
      baseUrl,
      oauthToken,
      perPage,
    );

    // Merge calendars - prefer ones with user_ids
    for (const [id, calendar] of calendarsWithUsers) {
      allCalendars.set(id, calendar);
    }

    // Build holiday -> calendar IDs mapping
    const holidayCalendarIds = this.buildHolidayCalendarIdsMapping(allCalendarAssociations);

    // Build holiday -> user IDs mapping
    const holidayUserIds = this.buildHolidayUserMapping(
      allHolidays,
      allCalendarAssociations,
      allCalendars,
    );

    this.logger.log(`Fetched ${allHolidays.length} total holidays from Kantata`);
    return {
      holidays: allHolidays,
      holidayUserIds,
      calendars: allCalendars,
      holidayCalendarIds,
    };
  }

  /**
   * Build a mapping of holiday ID to array of user IDs based on calendar associations
   */
  private buildHolidayUserMapping(
    holidays: KantataHoliday[],
    associations: KantataHolidayCalendarAssociation[],
    calendars: Map<string, KantataHolidayCalendar>,
  ): Map<string, string[]> {
    const holidayUserIds = new Map<string, string[]>();

    // Build a map of holiday_id -> calendar_ids
    const holidayToCalendars = new Map<string, Set<string>>();
    for (const assoc of associations) {
      if (!holidayToCalendars.has(assoc.holiday_id)) {
        holidayToCalendars.set(assoc.holiday_id, new Set());
      }
      holidayToCalendars.get(assoc.holiday_id)!.add(assoc.holiday_calendar_id);
    }

    // For each holiday, collect all user IDs from associated calendars
    for (const holiday of holidays) {
      const calendarIds = holidayToCalendars.get(holiday.id);
      if (!calendarIds || calendarIds.size === 0) {
        // No calendar associations - holiday applies to no specific users
        holidayUserIds.set(holiday.id, []);
        continue;
      }

      const userIds = new Set<string>();
      for (const calendarId of calendarIds) {
        const calendar = calendars.get(calendarId);
        if (calendar?.user_ids) {
          for (const userId of calendar.user_ids) {
            userIds.add(userId);
          }
        }
      }

      holidayUserIds.set(holiday.id, Array.from(userIds));
    }

    return holidayUserIds;
  }
}
