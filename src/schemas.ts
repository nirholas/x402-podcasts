// GENERATED from openapi.json — do not edit by hand.
//
// Per-route invocation contracts published inside the x402 402 challenge as
// `accepts[].outputSchema`. `input` tells an agent how to build the request
// (method, query/path params, JSON body fields); `output` is the JSON Schema of
// the 200 body it gets back once payment settles.
//
// Deriving these from `openapi.json` keeps the runtime challenge — which the
// x402scan discovery spec treats as authoritative — from ever contradicting the
// published spec. Regenerate whenever a paid route's parameters or response
// schema change.
//
// Keys match the paywall route map in `server.ts` exactly (`"<METHOD> <path>"`,
// with `:param` for path segments).

import type { RouteSchema } from "./payments.js";

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /search": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "q": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200,
          "examples": [
            "podcasting 2.0"
          ],
          "description": "Free-text search over title, author and description.",
          "x-required": true
        },
        "max": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20,
          "default": 5,
          "description": "Number of shows to return. Clamped to 1\u201320."
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "query",
        "source",
        "count",
        "shows",
        "searchedAt"
      ],
      "properties": {
        "query": {
          "type": "string"
        },
        "source": {
          "type": "string",
          "enum": [
            "podcastindex-live",
            "fixture"
          ],
          "description": "Where the data in this response came from. `fixture` means the deployment has no Podcast Index credentials \u2014 do not present it as a real search result."
        },
        "count": {
          "type": "integer"
        },
        "shows": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "feedId",
              "title",
              "categories",
              "explicit",
              "hasValueBlock"
            ],
            "properties": {
              "feedId": {
                "type": "integer"
              },
              "title": {
                "type": "string"
              },
              "author": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "description": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "url": {
                "type": [
                  "string",
                  "null"
                ],
                "description": "RSS feed URL."
              },
              "link": {
                "type": [
                  "string",
                  "null"
                ],
                "description": "Show homepage."
              },
              "image": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "language": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "categories": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "episodeCount": {
                "type": [
                  "integer",
                  "null"
                ]
              },
              "lastUpdate": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "date-time"
              },
              "explicit": {
                "type": "boolean"
              },
              "hasValueBlock": {
                "type": "boolean",
                "description": "The feed publishes a Podcasting 2.0 <podcast:value> block \u2014 the show accepts streaming micropayments."
              },
              "latestEpisode": {
                "oneOf": [
                  {
                    "type": "object",
                    "required": [
                      "episodeId",
                      "title",
                      "transcripts"
                    ],
                    "properties": {
                      "episodeId": {
                        "type": "integer"
                      },
                      "feedId": {
                        "type": [
                          "integer",
                          "null"
                        ]
                      },
                      "feedTitle": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "title": {
                        "type": "string"
                      },
                      "description": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "datePublished": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "format": "date-time"
                      },
                      "durationSeconds": {
                        "type": [
                          "integer",
                          "null"
                        ]
                      },
                      "enclosureUrl": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "format": "uri",
                        "description": "The audio file itself."
                      },
                      "enclosureType": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "enclosureLength": {
                        "type": [
                          "integer",
                          "null"
                        ],
                        "description": "Bytes."
                      },
                      "episodeNumber": {
                        "type": [
                          "integer",
                          "null"
                        ]
                      },
                      "season": {
                        "type": [
                          "integer",
                          "null"
                        ]
                      },
                      "explicit": {
                        "type": "boolean"
                      },
                      "image": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "link": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "transcripts": {
                        "type": "array",
                        "description": "Podcasting 2.0 <podcast:transcript> entries, when the feed publishes them.",
                        "items": {
                          "type": "object",
                          "properties": {
                            "url": {
                              "type": "string",
                              "format": "uri"
                            },
                            "type": {
                              "type": "string"
                            }
                          }
                        }
                      },
                      "guid": {
                        "type": [
                          "string",
                          "null"
                        ]
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            }
          }
        },
        "searchedAt": {
          "type": "string",
          "format": "date-time"
        },
        "receipt": {
          "type": [
            "object",
            "null"
          ]
        }
      }
    }
  },
  "GET /episode/:id": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {},
      "pathParams": {
        "id": {
          "type": "integer",
          "minimum": 1,
          "examples": [
            16795090960
          ],
          "description": "Podcast Index episode id (the `episodeId` returned by /search).",
          "x-required": true
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "source",
        "episode",
        "fetchedAt"
      ],
      "properties": {
        "source": {
          "type": "string",
          "enum": [
            "podcastindex-live",
            "fixture"
          ],
          "description": "Where the data in this response came from. `fixture` means the deployment has no Podcast Index credentials \u2014 do not present it as a real search result."
        },
        "episode": {
          "type": "object",
          "required": [
            "episodeId",
            "title",
            "transcripts"
          ],
          "properties": {
            "episodeId": {
              "type": "integer"
            },
            "feedId": {
              "type": [
                "integer",
                "null"
              ]
            },
            "feedTitle": {
              "type": [
                "string",
                "null"
              ]
            },
            "title": {
              "type": "string"
            },
            "description": {
              "type": [
                "string",
                "null"
              ]
            },
            "datePublished": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            },
            "durationSeconds": {
              "type": [
                "integer",
                "null"
              ]
            },
            "enclosureUrl": {
              "type": [
                "string",
                "null"
              ],
              "format": "uri",
              "description": "The audio file itself."
            },
            "enclosureType": {
              "type": [
                "string",
                "null"
              ]
            },
            "enclosureLength": {
              "type": [
                "integer",
                "null"
              ],
              "description": "Bytes."
            },
            "episodeNumber": {
              "type": [
                "integer",
                "null"
              ]
            },
            "season": {
              "type": [
                "integer",
                "null"
              ]
            },
            "explicit": {
              "type": "boolean"
            },
            "image": {
              "type": [
                "string",
                "null"
              ]
            },
            "link": {
              "type": [
                "string",
                "null"
              ]
            },
            "transcripts": {
              "type": "array",
              "description": "Podcasting 2.0 <podcast:transcript> entries, when the feed publishes them.",
              "items": {
                "type": "object",
                "properties": {
                  "url": {
                    "type": "string",
                    "format": "uri"
                  },
                  "type": {
                    "type": "string"
                  }
                }
              }
            },
            "guid": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        "fetchedAt": {
          "type": "string",
          "format": "date-time"
        },
        "receipt": {
          "type": [
            "object",
            "null"
          ]
        }
      }
    }
  },
};
