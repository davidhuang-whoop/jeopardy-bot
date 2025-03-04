import axios from 'axios';
import striptags from 'striptags';
import { load } from 'cheerio';
import { AllHtmlEntities } from 'html-entities';
import unidecode from 'unidecode';
import { Clue, Category } from '../types';

const { decode } = new AllHtmlEntities();

function simplifyText(text: string): string {
    return unidecode(decode(text)).replace(/\\/g, '');
}

// Hard code number of seasons:
// Season 33+ is relatively incomplete.
// const seasons = 34;

// Selector to get seasons URLs from
const episodeRegex = /Show #([0-9]+) -/;
const clueRegex = /clue_J_([0-9]+)_([0-9]+)/;
const answerRegex = /ponse">(.*)<\/e/;

async function loadEpisode(url: string) {
    const response = await axios.get(url, { responseType: 'text' });
    const $ = load(response.data);

    // Incomplete episode?
    if ($('#jeopardy_round .clue').length !== $('#jeopardy_round .clue_text').length) {
      throw new ReferenceError('Incomplete episode!');
    }

    // Extract the episode number:
    const headerText = $('#game_title > *').text();
    const episodeMatches = episodeRegex.exec(headerText) || [];
    const [, episode] = episodeMatches;

    // Extract categories:
    const categories: Category[] = [];
    $('#jeopardy_round .category_name').each((inputId, category) => {
        // Don't use zero-based index:
        const id = inputId + 1;
        categories.push({
            id,
            title: simplifyText($(category).text()),
        });
    });

    const clues: Clue[] = [];

    $('#jeopardy_round .clue').each((inputId, clue) => {
        // Don't use zero-based index:
        const id = inputId + 1;

        const $clue = $(clue);
        const $clueText = $clue.find('.clue_text');

        const clueMatches = clueRegex.exec($clueText.attr('id')) || [];
        const [, parsedCategoryId, parsedNum] = clueMatches;
        const categoryId = parseInt(parsedCategoryId, 10);
        const num = parseInt(parsedNum, 10);

        // Generate the value based on the number:
        const value = num * 200;

        let question = $clueText.html() as string;
        question = simplifyText(striptags(question, ['br']));
        question = question.replace(/<br\s*\/?>/gi, '\n');

        const media: string[] = [];
        $clueText.find('a').each((_, aTag) => {
            const href = $(aTag).attr('href');
            if (href) {
                media.push(href);
            }
        });

        // Extract the answer and strip HTML tags:
        const answerMatches =
            answerRegex.exec(
                $clue.find('td:first-child > div').attr('onmouseover'),
            ) || [];
        let [, answer] = answerMatches;
        answer = simplifyText(striptags(answer));

        // Extract if this question was a daily double:
        const dailyDouble = $clue.find('.clue_value_daily_double').length === 1;

        clues.push({
            id,
            categoryId,
            question,
            answer,
            value,
            media,
            dailyDouble,
            answered: false,
        });
    });

    // Return it:
    return {
        episode,
        roundOne: {
            categories,
            clues,
        },
    };
}

function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}

async function randomEpisode() {
    const season = Math.ceil(Math.random() * getRandomInt(20,35));
    const response = await axios.get(
        `http://www.j-archive.com/showseason.php?season=${season}`,
        { responseType: 'text' },
    );
    const $ = load(response.data);
    const links = $('td:first-child > a');
    const episodeLink = links
        .eq(Math.ceil(Math.random() * links.length))
        .attr('href');

    console.log(
        'Attempting to generate a new board from episode link',
        episodeLink,
    );

    const { episode, roundOne } = await loadEpisode(episodeLink);

    return {
        season,
        episode,
        roundOne,
    };
}

// Force-generate a new game:
export async function generateGame(gameId?: string) {
    if (gameId) {
        return loadEpisode(
            `http://www.j-archive.com/showgame.php?game_id=${gameId}`,
        );
    }

    let game;
    do {
        try {
            game = await randomEpisode();
        } catch (e) {
            console.error('Unable to generate game.', e);
        }
    } while (!game);
    return game;
}
