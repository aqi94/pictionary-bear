import type { Difficulty } from "./types";

const EASY = `
apple banana cat dog house tree sun moon star fish bird car boat book ball hat shoe cup chair table
bed door window flower cloud rain snow fire ice egg bread cheese pizza cake cookie candy ice cream
milk water juice spoon fork knife plate bowl clock key lock phone computer television lamp candle
pencil pen paper scissors glue bag box gift balloon kite drum guitar piano bell horn train bus truck
bicycle airplane rocket ship anchor umbrella glasses crown ring necklace watch sock shirt pants dress
jacket scarf glove boot bear rabbit mouse lion tiger elephant monkey giraffe zebra horse cow pig sheep
duck chicken frog snake turtle spider bee butterfly ant snail owl penguin whale shark octopus crab
dolphin ladybug worm bat wolf fox deer squirrel camel kangaroo panda koala beach mountain river lake
island volcano desert forest cave bridge castle tent barn church school hospital farm garden park zoo
road ladder fence wheel hammer nail saw broom bucket rope chain net hook flag map camera mirror comb
toothbrush soap towel pillow blanket teddy bear doll robot puzzle dice card crayon heart smile eye
nose ear mouth hand foot tooth hair bone skull ghost witch pumpkin snowman angel king queen pirate
clown baby cowboy doctor police firefighter chef astronaut mermaid dragon unicorn dinosaur alien
carrot corn tomato potato onion mushroom grapes lemon orange strawberry cherry pear peach watermelon
pineapple coconut popcorn hamburger hot dog taco sandwich donut lollipop pancake sushi soup salad
`;

const MEDIUM = `
lighthouse waterfall rainbow tornado earthquake iceberg sunset sunrise shadow footprint fingerprint
treasure chest telescope microscope compass magnet battery flashlight thermometer stethoscope
wheelchair skateboard scooter helicopter submarine hot air balloon parachute roller coaster ferris wheel
carousel trampoline seesaw swing slide sandcastle snowball snowflake campfire fireworks lantern
scarecrow windmill tractor wheelbarrow watering can birdhouse beehive spiderweb anthill cocoon nest
volcano eruption avalanche desert island pyramid sphinx igloo skyscraper elevator escalator staircase
chimney fireplace bathtub shower toilet sink refrigerator microwave toaster blender kettle teapot
vacuum cleaner washing machine sewing machine typewriter calculator headphones microphone speaker
keyboard joystick remote control light bulb candle stick chandelier hourglass sundial calendar
envelope stamp mailbox newspaper magazine dictionary library museum theater cinema stadium circus
magician juggler acrobat ballerina cheerleader wrestler boxer surfer skier snowboarder goalkeeper
referee lifeguard mail carrier plumber electrician mechanic gardener librarian dentist judge lawyer
detective spy ninja knight wizard vampire zombie mummy werewolf genie fairy troll giant elf gnome
octopus jellyfish seahorse starfish lobster shrimp walrus seal otter beaver hedgehog porcupine
raccoon skunk moose reindeer flamingo peacock parrot toucan pelican ostrich vulture eagle hummingbird
woodpecker chameleon iguana crocodile hippopotamus rhinoceros gorilla chimpanzee sloth armadillo
platypus cactus sunflower daisy tulip rose dandelion mushroom acorn pinecone seashell coral seaweed
bacon waffle pretzel burrito spaghetti meatball lasagna dumpling croissant bagel muffin cupcake
milkshake smoothie lemonade popsicle cotton candy bubble gum marshmallow gingerbread man fortune cookie
handshake high five thumbs up hug yawn sneeze hiccup snore whisper shout dance jump swim climb crawl
`;

const HARD = `
photosynthesis gravity electricity friction evaporation echo reflection silhouette camouflage
hibernation migration extinction democracy freedom justice peace chaos boredom curiosity jealousy
nostalgia deja vu procrastination insomnia claustrophobia allergy headache heartbeat goosebumps
blindfold eavesdrop daydream nightmare brainstorm time travel black hole big bang solar eclipse
northern lights tectonic plates food chain carbon footprint global warming social media selfie
hashtag emoji password wifi bluetooth podcast playlist screenshot autocorrect livestream meme
influencer traffic jam rush hour road trip jet lag layover carry on passport customs souvenir
first aid kit smoke detector fire escape emergency exit speed bump crosswalk roundabout toll booth
recycling compost landfill scarecrow bird of prey guardian angel wishing well fountain of youth
olympics marathon triathlon hole in one slam dunk touchdown home run checkmate bullseye jackpot
tug of war hide and seek musical chairs hopscotch charades pictionary karaoke stand up comedy
ventriloquist mime origami calligraphy graffiti mosaic sculpture pottery embroidery knitting
sunburn frostbite paper cut splinter bruise bandage crutches stitches x-ray cavity braces
bookworm couch potato early bird night owl copycat scapegoat black sheep cold feet butterflies
sweet tooth brain freeze ponytail beard mustache dimples freckles wrinkles eyebrows eyelashes
cliffhanger plot twist happy ending once upon a time superhero sidekick villain lair secret identity
invisibility cloak crystal ball magic carpet flying saucer time machine treasure map message in a bottle
`;

function parse(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => splitLine(line));
}

// Lines contain space-separated single words, except known multi-word phrases below.
const PHRASES = [
  "ice cream", "teddy bear", "hot dog", "treasure chest", "hot air balloon", "roller coaster",
  "ferris wheel", "desert island", "watering can", "vacuum cleaner", "washing machine",
  "sewing machine", "remote control", "light bulb", "candle stick", "mail carrier",
  "cotton candy", "bubble gum", "gingerbread man", "fortune cookie", "high five", "deja vu",
  "time travel", "black hole", "big bang", "solar eclipse", "northern lights", "tectonic plates",
  "food chain", "carbon footprint", "global warming", "social media", "traffic jam", "rush hour",
  "road trip", "jet lag", "carry on", "first aid kit", "smoke detector", "fire escape",
  "emergency exit", "speed bump", "toll booth", "bird of prey", "guardian angel", "wishing well",
  "fountain of youth", "hole in one", "slam dunk", "home run", "tug of war", "hide and seek",
  "musical chairs", "stand up comedy", "paper cut", "couch potato", "early bird", "night owl",
  "black sheep", "cold feet", "sweet tooth", "brain freeze", "plot twist", "happy ending",
  "once upon a time", "secret identity", "invisibility cloak", "crystal ball", "magic carpet",
  "flying saucer", "time machine", "treasure map", "message in a bottle", "volcano eruption",
];

const PHRASE_SET = new Set(PHRASES);
const MAX_PHRASE_WORDS = 5;

function splitLine(line: string): string[] {
  const tokens = line.split(/\s+/);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let n = Math.min(MAX_PHRASE_WORDS, tokens.length - i); n >= 2; n--) {
      const candidate = tokens.slice(i, i + n).join(" ");
      if (PHRASE_SET.has(candidate)) {
        out.push(candidate);
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}

export const WORDS: Record<Exclude<Difficulty, "mixed">, string[]> = {
  easy: dedupe(parse(EASY)),
  medium: dedupe(parse(MEDIUM)),
  hard: dedupe(parse(HARD)),
};

export function wordPool(difficulty: Difficulty): string[] {
  if (difficulty === "mixed") return [...WORDS.easy, ...WORDS.medium, ...WORDS.hard];
  return WORDS[difficulty];
}

export function pickWords(
  difficulty: Difficulty,
  used: Iterable<string>,
  count = 3,
  rng: () => number = Math.random,
): string[] {
  const usedSet = new Set(used);
  let pool = wordPool(difficulty).filter((w) => !usedSet.has(w));
  if (pool.length < count) pool = wordPool(difficulty);
  const picks: string[] = [];
  const copy = [...pool];
  while (picks.length < count && copy.length) {
    const i = Math.floor(rng() * copy.length);
    picks.push(copy.splice(i, 1)[0]);
  }
  return picks;
}
