const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');

async function example() {
  const chromeOptions = new chrome.Options();

  chromeOptions.addArguments('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  chromeOptions.addArguments("--disable-search-engine-choice-screen");

  chromeOptions.setUserPreferences({
    profile: {
      default_content_settings: {
        images: 2
      },
      managed_default_content_settings: {
        images: 2
      }
    }
  });

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();

  let url = `http://www.clubtokyo.org/site/showEntryByCategory?categoryId=34&manufacturerId=5`;
  await driver.get(url);

  let offersUrl = [];

  let items = await driver.findElements(By.css('.moreInfoContainer'))

  for (let item of items) {
    let offerUrl = await item.getAttribute('id')
    const figureId = offerUrl.split('_')
    offersUrl.push(figureId[1]);
  }

  const offers = []

  for (let offerUrl of offersUrl){
    let url = `http://www.clubtokyo.org/site/showCategoryVariation?entryId=${offerUrl}`
    await driver.get(url);

    const description = await driver.findElement(By.css('.descriptionBlock span')).getText()
    let specifications = await driver.findElements(By.css('.dataRow'))

    const offer = {
      id: offerUrl,
      character: await driver.findElement(By.css('.titleImageBar span span')).getText(),
      description,
    }

    for (let specification of specifications){
      let specificationTitle = (await specification.findElement(By.css('.rowTitle')).getText()).replace(' :', '').replace(':', '')
      let specificationValue = null;

      try {
        specificationValue = await specification.findElement(By.css('.valueCell')).getText();
      } catch (error) {
        if (error.name === 'NoSuchElementError') {
            specificationValue = null;
        } else {
            throw error; 
        }
      }

      offer[toCamelCase(specificationTitle)] = specificationValue
    }

    delete offer[''];
    offers.push(offer)
  }
  
  fs.writeFileSync('clubtokyo-bullmark.json', JSON.stringify(offers, null, 2));
}

function toCamelCase(str) {
  str = str.toLowerCase();

  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
      if (+match === 0) return ""; 
      return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
}

example();