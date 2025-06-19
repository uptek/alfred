import defaultIcon from "@/assets/icon-default.svg";
import privacyIcon from "@/assets/icon-privacy.svg";
import tutorialIcon from "@/assets/icon-tutorial.svg";
import demoIcon from "@/assets/icon-demo.svg";
import docsIcon from "@/assets/icon-docs.svg";
import supportIcon from "@/assets/icon-support.svg";
import type { AppRaw, App, Resource } from "./types";

/**
 * Fetch the app data
 * @param link {string} - The link to the app
 * @returns {AppRaw} The app data
 */
export const fetchAppData = async (link: string): Promise<AppRaw> => {
  let appData: AppRaw = {
    resources: [],
    developer: {
      website: null,
      address: null,
    },
    launchDate: null,
    age: null,
    detailedAge: null,
  };

  try {
    const response = await fetch(link);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const devSection = doc.querySelector("#adp-developer");

    if (!devSection) return appData;

    // Cache all heading elements to avoid repeated queries
    const headingElements = devSection.querySelectorAll("h3, p");

    // Extract Resources
    const resourcesElement = Array.from(headingElements).find((el) =>
      el.textContent?.trim().toLowerCase().includes("resources")
    );

    if (resourcesElement) {
      const resourcesSection = resourcesElement.parentElement;
      const resourceLinks = resourcesSection?.querySelectorAll("a");
      resourceLinks?.forEach((link) => {
        appData.resources.push({
          title: link.textContent?.trim() || "",
          url: link.href,
        });
      });
    }

    // Extract Developer info
    const developerElement = Array.from(headingElements).find((el) =>
      el.textContent?.trim().toLowerCase().includes("developer")
    );

    if (developerElement) {
      const developerSection = developerElement.parentElement;

      // Find website link by text content
      const links = developerSection?.querySelectorAll("a");
      const websiteElement = Array.from(links || []).find((link) =>
        link.textContent?.trim().toLowerCase().includes("website")
      );

      if (websiteElement) {
        appData.developer.website = websiteElement.href || null;
      }

      // Find address (assumed to be the last paragraph)
      const paragraphs = developerSection?.querySelectorAll("p");
      if (paragraphs && paragraphs.length > 0) {
        const addressElement = paragraphs[paragraphs.length - 1];
        appData.developer.address = addressElement.textContent?.trim() || null;
      }
    }

    // Extract Launch date
    const launchElement = Array.from(headingElements).find((el) =>
      el.textContent?.trim().toLowerCase().includes("launch")
    );

    if (launchElement) {
      const dateElement = launchElement.nextElementSibling;
      if (dateElement) {
        // Find the changelog link by its text content instead of href
        const anchors = dateElement.querySelectorAll("a");
        let changelogAnchor = null;
        for (const anchor of anchors) {
          if (anchor.textContent?.trim().toLowerCase() === "changelog") {
            changelogAnchor = anchor;
            break;
          }
        }

        let launchDateText = dateElement.textContent?.trim() || null;

        // If we found a changelog link
        if (changelogAnchor) {
          // Extract only the date part (text before the anchor)
          const textContent = dateElement.textContent?.trim() || null;
          const anchorText = changelogAnchor.textContent?.trim() || null;
          // Remove the anchor text and any separator (like "·") from the text content
          launchDateText = textContent?.split("·")[0].trim() || null;

          // Add the changelog link to resources
          appData.resources.push({
            title: "Changelog",
            url: changelogAnchor.href,
          });
        }

        appData.launchDate = launchDateText;

        // Calculate app age in years and months
        const launchDate = new Date(launchDateText || "");
        if (!isNaN(launchDate.getTime())) {
          const currentDate = new Date();

          // Calculate differences
          const diffTime = Math.abs(
            currentDate.getTime() - launchDate.getTime()
          );
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          // Calculate difference in years and months
          let years = currentDate.getFullYear() - launchDate.getFullYear();
          let months = currentDate.getMonth() - launchDate.getMonth();

          // Adjust years and months if needed
          if (months < 0) {
            years--;
            months += 12;
          }

          // Create age string based on timeframe
          let ageString = "";
          if (years === 0 && months === 0) {
            // Less than a month - show in days
            if (diffDays === 0) {
              ageString = "Today";
            } else if (diffDays === 1) {
              ageString = "1 day";
            } else {
              ageString = diffDays + " days";
            }
          } else if (years === 0) {
            // Less than a year - show in months
            ageString = months + (months === 1 ? " month" : " months");
          } else {
            // More than a year - show as X.Y years
            const decimalMonths = (months / 12).toFixed(1).substring(1);
            ageString =
              years +
              decimalMonths +
              (years === 1 && months === 0 ? " year" : " years");
          }

          appData.age = ageString.trim() || null;

          // Also add detailed age format
          appData.detailedAge = formatDetailedAge(launchDateText || "");
        }
      }
    }
  } catch (error) {
    // Log error but don't throw to prevent Promise rejection
    console.error("Error fetching app data:", error);
  }

  return appData;
};

/**
 * Format the detailed age
 * @param launchDateStr {string} - The launch date
 * @returns {string} The detailed age
 */
const formatDetailedAge = (launchDateStr: string) => {
  if (!launchDateStr) return null;

  const launchDate = new Date(launchDateStr);
  if (isNaN(launchDate.getTime())) return null;

  const currentDate = new Date();

  // Calculate time difference in milliseconds
  const diffTime = Math.abs(currentDate.getTime() - launchDate.getTime());

  // Calculate total days difference
  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Calculate years, months, and remaining days
  let years = Math.floor(totalDays / 365);
  let remainingDays = totalDays % 365;

  // Approximate months (using 30.4 days as average month length)
  let months = Math.floor(remainingDays / 30.4);
  remainingDays = Math.floor(remainingDays % 30.4);

  // Format the result
  let formattedAge = "";
  if (years > 0) {
    formattedAge += `${years} ${years === 1 ? "year" : "years"}`;
  }

  if (months > 0) {
    if (formattedAge) formattedAge += ", ";
    formattedAge += `${months} ${months === 1 ? "month" : "months"}`;
  }

  if (remainingDays > 0 || (years === 0 && months === 0)) {
    if (formattedAge) formattedAge += ", ";
    formattedAge += `${remainingDays} ${remainingDays === 1 ? "day" : "days"}`;
  }

  return formattedAge;
};

/**
 * Get the page title from the H1 element
 * @returns {string} The handleized page title
 */
const getPageTitle = () => {
  const h1 = document.querySelector("h1")?.textContent?.trim();
  let pageTitle = h1 || "shopify";

  return pageTitle
    .toLowerCase()
    .replace("apps by", "")
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
};

/**
 * Convert the apps to a CSV string
 * @param apps {App[]} - The apps to convert
 * @returns {string} The CSV string
 */
const convertToCSV = (apps: App[]) => {
  // Define the columns we want to export
  const columns = [
    "Name",
    "Rating",
    "Reviews",
    "Pricing",
    "Launch Date",
    "Installed",
    "Built for Shopify",
    "Description",
    "App URL",
    "Website",
  ];

  // Create the CSV header row
  let csv = columns.join(",") + "\n";

  // Add each app as a row in the CSV
  apps.forEach((app) => {
    // Format the values and handle special cases
    const values = [
      // Escape quotes in name and wrap in quotes
      '"' + (app.name || "").replace(/"/g, '""') + '"',
      // Rating
      app.rating || "N/A",
      // Review count
      app.reviewCount || "0",
      // Escape quotes in pricing and wrap in quotes
      '"' + (app.pricing || "").replace(/"/g, '""') + '"',
      // Launch date - properly quoted to prevent CSV issues with commas
      '"' + (app.launchDate || "").replace(/"/g, '""') + '"',
      // Installed status (Yes/No)
      app.isInstalled ? "Yes" : "No",
      // Built for Shopify status (Yes/No)
      app.isBuiltForShopify ? "Yes" : "No",
      // Escape quotes in description and wrap in quotes
      '"' + (app.description || "").replace(/"/g, '""') + '"',
      // App URL
      app.link.split("?")[0].split("#")[0] || "",
      // Website URL
      app.developer && app.developer.website ? app.developer.website : "",
    ];

    // Add the row to the CSV
    csv += values.join(",") + "\n";
  });

  return csv;
};

/**
 * Download the CSV file
 * @param apps {App[]} - The apps to download
 */
export const downloadCSV = (apps: App[]) => {
  const csv = convertToCSV(apps);

  // Create a blob with the CSV data
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  // Create a link to download the blob
  const link = document.createElement("a");

  // Create the download URL
  const url = URL.createObjectURL(blob);

  // Generate filename
  const pageTitle = getPageTitle();
  const date = new Date().toISOString().split("T")[0];
  const filename = `shopify-alfred-${pageTitle}-${date}.csv`;

  // Setup the link properties
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  // Add the link to the DOM
  document.body.appendChild(link);

  // Click the link to trigger the download
  link.click();

  // Clean up
  document.body.removeChild(link);
};

export const getResourceIcon = (resource: Resource) => {
  let icon = defaultIcon;
  const title = resource.title.toLowerCase();
  const url = resource.url.toLowerCase();

  // Determine icon type
  if (title.includes("privacy") || url.includes("privacy")) {
    icon = privacyIcon;
  } else if (
    title.includes("tutorial") ||
    title.includes("guide") ||
    title.includes("how to") ||
    title.includes("learn") ||
    title.includes("lesson")
  ) {
    icon = tutorialIcon;
  } else if (title.includes("demo") || title.includes("example")) {
    icon = demoIcon;
  } else if (title.includes("doc") || title.includes("manual")) {
    icon = docsIcon;
  } else if (
    title.includes("support") ||
    title.includes("help") ||
    title.includes("faq")
  ) {
    icon = supportIcon;
  }

  return icon;
};
