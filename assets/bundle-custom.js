class RechargeCustomBundle extends HTMLElement {
    constructor() {
        super();
        this.bundleSettings;
        this.bundleVariant;
        this.itemCount;
        this.optionSource = '';
        this.product;
        this.productID = document.querySelector('.bundle').getAttribute('data-product-id');
        this.selectionCount = 0;
        this.selections = [];
        this.sellingPlan = '';
        this.sellingVariant;
        this.requiredCount = 0;
        this.translations;
        this.variantID = Number(document.querySelector('.bundle').getAttribute('data-variant-id'));
        this.variants;
        this.widget;
        this.initializeBundle();
        this.selectionNames = [];
    }

    // initialize bundle
    async initializeBundle() {
        this.bundleSettings = await recharge.cdn.getCDNBundleSettings(this.productID)
        this.product = await recharge.cdn.getCDNProduct(this.productID);
        this.widget = await recharge.cdn.getCDNWidgetSettings(this.productID);
        this.variants = this.bundleSettings.variants;
        this.translations = this.widget.bundle_translations;
        this.bundleVariant = this.getBundleVariant(this.variantID),
        this.renderBundle();
    };

    // This function is responsible for rendering the bundle options and plan options based on the selected variant

    renderBundle() {
        // Get the variant ID and the selling variant based on that ID
        let variantID = this.variantID,
            sellingVariant = this.getSellingVariant(variantID),
            sellingPlan,
            price = sellingVariant.prices.unit_price,
            subscribePrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price;

        // Set the item count of the bundle, update text on the form, and set the data attribute
        this.itemCount = this.bundleVariant.items_count;
        document.querySelector('.bundle__form-dropdown label').innerText = this.translations.cpb_frequency;
        document.querySelector('.bundle__form-add.bundle-btn span').innerText = this.translations.cpb_add_items_to_continue.replace('{remainder}', this.bundleVariant.items_count);
        document.querySelector('.bundle').setAttribute('data-item-count', this.bundleVariant.items_count);

        // If select_subscription_first is true, set the sellingPlan and the data attribute of the bundle accordingly
        if (this.widget.select_subscription_first) {
            sellingPlan = sellingVariant.selling_plan_allocations[0].selling_plan_id;
            document.querySelector('.bundle').setAttribute('data-selected', 'subscription');
            this.sellingPlan = sellingPlan;
        }

        // Render plan options for the selling variant
        this.renderPlanOptions(sellingVariant);

        // Add event listener for the change in dropdown selection
        document.querySelector('.bundle__form-dropdown-select').addEventListener('change', this.handleDropdownChange.bind(this, sellingVariant));

        // Update the price based on the selected plan
        this.updatePrice(price, subscribePrice, compareAtPrice);

        // Check collections based on the selected bundle
        this.checkCollections(this.bundleVariant);
    }

    // This function is responsible for rendering the plan options for the selling variant
    renderPlanOptions(sellingVariant) {
        let prod = this.product;

        // If the product is not subscription only, add a one-time option to the dropdown
        if (!prod.isSubscriptionOnly) {
            let oneTimeOption = document.createElement('option');

            oneTimeOption.value = 'One Time';
            oneTimeOption.innerText = this.translations.pdp_only_once;
            document.querySelector('.bundle__form-dropdown-select').appendChild(oneTimeOption);

            // Set the data attribute of the bundle accordingly if select_subscription_first is false
            if (!this.widget.select_subscription_first) {
                document.querySelector('.bundle').setAttribute('data-selected', 'one-time');
            }
        }

        // Loop through the selling plan allocations of the selling variant and add them to the dropdown as options
        sellingVariant.selling_plan_allocations.forEach(function (item, i) {
            let option = document.createElement('option'),
                planGroup = prod.selling_plan_groups.find(obj => obj.selling_plan_group_id === item.selling_plan_group_id),
                plan = planGroup.selling_plans.find(obj => obj.selling_plan_id === item.selling_plan_id),
                discount = plan.price_adjustments_value + '%';

            // Attach necessary data to the option
            option.value = plan.selling_plan_id;
            option.innerText = plan.selling_plan_name;
            option.setAttribute('data-discount', discount);
            option.setAttribute('data-price', item.discounted_price);

            // Append the option to the dropdown
            document.querySelector('.bundle__form-dropdown-select').appendChild(option);

            // If this is the first option and the product is not subscription only, set the option as selected
            if(i === 0 && !prod.isSubscriptionOnly) {
                option.setAttribute('selected', 'selected');
            }
        })
    }

    //  This function is responsible for looping and rendering the bundle collections
    checkCollections(bundleVariant) {
        // Iterate over the option_sources array
        bundleVariant.option_sources.forEach((item, i) => {
          // Get the collection id from the current item
          const collectionId = item.collection_id;
          // Set the access token for the Shopify storefront API
          const accessToken = "342ac763d5c1d555463b56d7d3f952b6";

          this.requiredCount = this.requiredCount + item.quantity_min;

          // Make a GraphQL API request to get information about the collection
          fetch(`/api/2021-07/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Storefront-Access-Token": accessToken
            },
            body: JSON.stringify({
              query: `
                query getCollectionById($id: ID!) {
                  collection(id: $id) {
                    title
                    products(first: 10) {
                      edges {
                        node {
                          id
                          title
                          descriptionHtml
                          images(first: 1) {
                            edges {
                              node {
                                originalSrc
                                altText
                              }
                            }
                          }
                          variants(first: 1) {
                            edges {
                              node {
                                id
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: `gid://shopify/Collection/${collectionId}`
              }
            })
          })
          .then(response => response.text())
          .then(data => {
            // try to parse the response data as JSON and render the collection
            try {
              this.renderCollection(JSON.parse(data).data.collection, item);
            } catch (error) {
              console.error(error);
            }
          })
          .catch(error => console.error(error));
        });
    }

    // This function renders a collection of items, including a header with a title and status, as well as a wrapper for the collection items.
    renderCollection(collection, item) {
        // Create necessary elements for the collection header and items wrapper.
        const wrapper = document.createElement("div");
        const header = document.createElement("div");
        const title = document.createElement("h2");
        const status = document.createElement("span");
        const itemWrapper = document.createElement("div");

        // Convert the minimum and maximum quantity to numbers if they exist.
        let min,
            max;

        if(item.quantity_min != null) {
            min = Number(item.quantity_min);
        } else {
            wrapper.classList.add('no-min');
        }

        if(item.quantity_max != null) {
            max = item.quantity_max;
        } else {
            max = (this.itemCount - this.requiredCount);
        }

        // Set the title text, and add appropriate classes to the item wrapper and wrapper elements.
        title.textContent = collection.title;
        itemWrapper.classList.add("bundle__items");
        wrapper.classList.add('bundle__collection');
        header.classList.add('bundle__collection-header');

        // Add the title and status elements to the header, and append the header and item wrapper elements to the main wrapper.
        header.appendChild(title);
        header.appendChild(status);
        wrapper.appendChild(header);
        wrapper.appendChild(itemWrapper);

        // Set data attributes on the main wrapper element for the collection's current value and ID.
        wrapper.setAttribute('data-collection-current', 0);
        wrapper.setAttribute('data-collection-id', item.collection_id);

        // Set data attributes on the main wrapper element for the minimum and maximum quantity if they exist.
        if (min != undefined) {
            wrapper.setAttribute('data-collection-min', min);
            wrapper.classList.add('bundle-has-minimum');
        }

        if (max != undefined) {
            wrapper.setAttribute('data-collection-max', max);
        }

        // If both minimum and maximum quantity are defined, set the status text to an appropriate message.
        if (min != undefined && max != undefined) {
            if (min != max) {
                if (min === 0) {
                    status.innerText = this.translations.pdp_choose_maximum.replace('{remainder}', max);
                } else {
                    status.innerText = this.translations.pdp_choose_range.replace('{min}', min).replace('{max}', max);
                }
            } else {
                status.innerText = this.translations.pdp_choose_items.replace('{remainder}', min);
            }
        }

        // Call the renderProducts function to render the collection items, and append the main wrapper to the DOM.
        this.renderProducts(collection.products.edges, wrapper)
        document.querySelector('.bundle__lower').appendChild(wrapper)
    }

    // This function handles adding an item to a bundle collection
    handleItemAdd(ev) {
        // Find the closest item and collection elements using DOM traversal
        const item = ev.target.closest('.bundle__item');
        const collection = item.closest('.bundle__collection');
        const itemTitle = item.querySelector('.bundle__item-title').innerText;

        // Get the ID of the bundle collection, its maximum allowed quantity, and the ID of the selected item's variant and product
        const collectionID = collection.dataset.collectionId;
        const collectionMin = Number(collection.dataset.collectionMin);
        const collectionMax = Number(collection.dataset.collectionMax);
        const variantID = item.dataset.variantId;
        const productID = item.dataset.productId;
        let selectionNames = this.selectionNames;



        // Get the quantity input element of the selected item and its current value
        const qty = item.querySelector('.bundle__item-quantity');
        let val = qty.value;

        // Increase the quantity of the selected item by 1
        val++;

        // Add a class to the selected item to indicate that it has been selected
        item.classList.add('item-selected');

        // If the maximum quantity of the bundle collection has been set, check if the selected item exceeds it
        if (val > collectionMax) {
            // If the maximum quantity has been exceeded, return from the function
            return;
        }

        // Create an object containing the IDs and quantity of the selected item
        const itemObj = {
            collectionId: collectionID,
            externalProductId: productID,
            externalVariantId: variantID,
            quantity: 1
        };

        // Get the total number of items in the collection and the number of selected items
        const itemCount = this.itemCount;
        const selectionCount = this.selectionCount;

        // If the current quantity of the selected item equals the maximum allowed quantity of the bundle collection or the total number of items in the collection, add a class to the collection element to indicate that the maximum quantity has been reached
        if (val === collectionMax || val === itemCount) {
            collection.classList.add('max-reached');
        }

        if (selectionCount < itemCount) {
            if (selectionNames.some(e => e.title === itemTitle)) {
                selectionNames.forEach((selection, index) => {
                    if (selection.title === itemTitle) {
                        selectionNames[index].quantity++
                    }
                });
            } else {
                this.selectionNames.push({
                    title: itemTitle,
                    quantity: 1
                });
            }

            qty.value = val;
            collection.dataset.collectionCurrent = val;

            this.selections.push(itemObj);
            this.selectionCount++;

            if (selectionCount === itemCount - 1) {
                document.querySelector('.bundle__lower').classList.add('bundle-max-reached');
            }

            this.updateBundleStatus();

            if (collectionMin && val >= collectionMin) {
                collection.classList.add('min-reached')
            }
        }
    }

    // This function is used to handle the removal of an item from a bundle
    handleItemRemove(ev) {
        // Get the bundle item that triggered the event and its corresponding information
        const item = ev.target.closest('.bundle__item');
        const itemTitle = item.querySelector('.bundle__item-title').innerText;
        const qty = item.querySelector('.bundle__item-quantity');

        // Get the parent collection of the bundle item and its minimum quantity
        const collection = item.closest('.bundle__collection');
        const collectionMin = parseInt(collection.dataset.collectionMin);

        // Decrement the quantity of the bundle item
        let val = parseInt(qty.value);
        val--;

        // If the quantity of the bundle item is less than the collection minimum, remove the "min-reached" class from the collection
        if (collectionMin && val < collectionMin) {
            collection.classList.remove('min-reached');
        }

        // If the quantity of the bundle item is 0, remove the "item-selected" class from the bundle item
        if (val === 0) {
            item.classList.remove('item-selected');
        }

        // Remove the "bundle-max-reached" class from the bundle lower and the "max-reached" class from the parent collection
        const bundleLower = document.querySelector('.bundle__lower');
        bundleLower.classList.remove('bundle-max-reached');
        item.closest('.bundle__collection').classList.remove('max-reached');

        // If the quantity of the bundle item is greater than or equal to 0, update the selection count and quantity of the bundle item
        if (val >= 0) {
            // Update the selection names and quantities of the bundle items
            let selectionNames = this.selectionNames;
            selectionNames.forEach((selection, index) => {
                if (selection.title === itemTitle) {
                    selectionNames[index].quantity--;
                    if (selectionNames[index].quantity === 0) {
                        selectionNames.splice(index, 1);
                    }
                }
            });

            // Remove the "color-red" class from all collection headers
            document.querySelectorAll('.bundle__collection-header span.color-red').forEach(collection => {
                collection.classList.remove('color-red');
            });

            // Update the quantity and current value of the bundle item, and update the bundle status
            this.selectionCount--;
            qty.value = val;
            collection.dataset.collectionCurrent = val;
            this.updateBundleStatus();
        }
    }

    renderProducts(products, collectionEl) {
        products.forEach((item, i) => {
            const product = item.node;

            // Create a product card element
            const productCard = document.createElement("div");
            productCard.classList.add("bundle__item");
            productCard.dataset.productId = product.id.replace('gid://shopify/Product/', '');
            productCard.dataset.variantId = product.variants.edges[0].node.id.replace('gid://shopify/ProductVariant/', '');

            // Create the product image wrapper element
            const imageWrapper = document.createElement("div");
            imageWrapper.classList.add("bundle__item-image-wrapper");
            productCard.appendChild(imageWrapper);

            // Create the aspect ratio wrapper element
            const imageEl = document.createElement("div");
            imageEl.classList.add("bundle__item-image");

            imageWrapper.appendChild(imageEl);

            // Create the product image element
            const image = document.createElement("img");
            image.src = product.images.edges[0].node.originalSrc;
            image.alt = product.title;
            imageEl.appendChild(image);

            // Create the product content element
            const content = document.createElement("div");
            content.classList.add("bundle__item-content");
            productCard.appendChild(content);

            // Create the product title element
            const title = document.createElement("p");
            title.classList.add("bundle__item-title");
            title.textContent = product.title;
            content.appendChild(title);

            // Create the product description element
            const description = document.createElement("p");
            description.classList.add("bundle__item-description", "hidden");
            description.innerHTML = product.descriptionHtml;
            content.appendChild(description);

            // Create the product controls element
            const controls = document.createElement("div");
            controls.classList.add("bundle__item-controls");
            content.appendChild(controls);

            // Create the remove button element
            const removeButton = document.createElement("button");
            removeButton.classList.add("bundle__item-remove", "bundle-btn");
            removeButton.innerHTML = "<span>-</span>";
            removeButton.addEventListener('click', this.handleItemRemove.bind(this))
            controls.appendChild(removeButton);

            // Create the quantity input element
            const quantityInput = document.createElement("input");
            quantityInput.classList.add("bundle__item-quantity");
            quantityInput.type = "number";
            quantityInput.value = 0;
            quantityInput.readOnly = true;
            controls.appendChild(quantityInput);

            // Create the add button element
            const addButton = document.createElement("button");
            addButton.classList.add("bundle__item-add", "bundle-btn");
            addButton.innerHTML = "<span>+</span>";
            controls.appendChild(addButton);
            addButton.addEventListener('click', this.handleItemAdd.bind(this))

            collectionEl.querySelector('.bundle__items').appendChild(productCard);
        })
    }

    // This asynchronous function is used to update the bundle status
    async updateBundleStatus() {
        // Get the "Add to Cart" button and adjust the progress bar
        let button = document.querySelector('.bundle__form-add');
        this.adjustProgressBar(this.selectionCount);

        // Replace the "Add to Cart" button with a cloned node
        button.replaceWith(button.cloneNode(true));

        // If the number of selections matches the number of items in the bundle
        if (this.selectionCount === this.itemCount) {
            // Check if the bundle is valid
            if (this.checkBundle()) {
                // If the bundle is valid, get the bundle ID and update the "Add to Cart" button text and click event
                const selection = {
                    externalVariantId: this.variantID,
                    externalProductId: this.productID,
                    selections: this.selections
                };
                const _rb_id = await recharge.bundle.getBundleId(selection, {});
                document.querySelector('.bundle__form-add span').innerText = this.translations.pdp_add_to_cart;
                document.querySelector('.bundle__form-add').addEventListener('click', this.addBundleToCart.bind(this, _rb_id));
            } else {
                // If the bundle is invalid, update the "Add to Cart" button text and add the "color-red" class to the collection headers that haven't reached their minimums
                document.querySelector('.bundle__form-add span').innerText = this.translations.cpb_update_bundle_contents;
                document.querySelectorAll('.bundle__collection.bundle-has-minimum:not(.min-reached)').forEach(collection => {
                    collection.querySelector('.bundle__collection-header span').classList.add('color-red');
                });
            }
        } else {
            // If the number of selections does not match the number of items in the bundle, clear the bundle ID value and update the "Add to Cart" button text
            document.querySelector('.product-bundle-id').value = '';
            document.querySelector('.bundle__form-add span').innerText = this.translations.cpb_add_items_to_continue.replace('{remainder}', (this.itemCount - this.selectionCount));
        }
    }

    // This function checks whether the minimum number of items for each collection in the bundle has been reached
    checkBundle() {
        // Set the "minimumReached" and "minimumMet" variables to true
        let minimumReached = true;
        this.minimumMet = true;

        // For each collection that has a minimum number of items, check if the current number of items is less than the minimum
        document.querySelectorAll('.bundle__collection:not(.no-min)').forEach(collection => {
            if (Number(collection.dataset.collectionCurrent) < Number(collection.dataset.collectionMin)) {
                // If the current number of items is less than the minimum, set "minimumReached" and "minimumMet" to false
                minimumReached = false;
                this.minimumMet = false;
            }
        })

        // Return the "minimumReached" value
        return minimumReached;
    }

   // This function adds the selected bundle to the cart
    async addBundleToCart(_rb_id) {
        // Initialize "selections" and "selectionNames" variables
        let selections = '',
        selectionNames = this.selectionNames

        // For each selection, create a string representation of its name and quantity
        selectionNames.forEach((selection, i) => {
            selections = selections + selection.title + ' x' + selection.quantity
        
            // If this is not the last selection, add a comma separator
            if (i < selectionNames.length - 1) {
                selections = selections + ', '
            }
        });
        
        // Create a data object to send in the fetch request to add the bundle to the cart
        const data = {
            items: [
                {
                    id: this.variantID,
                    quantity: 1,
                    selling_plan: this.sellingPlan,
                    properties: {
                        bundle_id: _rb_id,
                        Contents: selections
                    },
                },
            ],
        };

        // Send a POST request to add the bundle to the cart
        await fetch(`${window.Shopify.routes.root}cart/add.js`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });
        // Redirect the user to the cart page
        window.location.href = '/cart';
    }

    adjustProgressBar(selectionCount) {
        document.querySelector('.bundle__progress-bar-inner').style.width = (selectionCount / this.itemCount) * 100 + '%';
    }

    handleDropdownChange(sellingVariant, ev) {
        let price = sellingVariant.prices.unit_price,
            subscribePrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price;

        if (ev.target.value === 'One Time') {
            document.querySelector('.bundle').setAttribute('data-selected', 'one-time');
            this.sellingPlan = '';
        } else {
            document.querySelector('.bundle').setAttribute('data-selected', 'subscription');
            this.sellingPlan = ev.target.value;
        }

        this.updatePrice(price, subscribePrice, compareAtPrice);
    }

    // updates the price when the variant or selling plan is changed
    updatePrice(price, subscribePrice, compareAtPrice) {
        const selected = document.querySelector('.bundle').getAttribute('data-selected');
        const priceContainer = document.querySelector('.bundle__price');
        const priceRegular = priceContainer.querySelector('.bundle__price-regular');
        const priceDiscount = priceContainer.querySelector('.bundle__price-discount');
        let newPrice;

        if (selected === 'one-time') {
            newPrice = price;
        } else if (selected === 'subscription') {
            newPrice = subscribePrice;
        }

        if (compareAtPrice != null ) {
            priceDiscount.innerText = '$' + compareAtPrice;
            priceDiscount.classList.remove('hidden');
        } else {
            if (selected === 'subscription') {
                priceDiscount.innerText = '$' + price;
                priceDiscount.classList.remove('hidden');
            } else {
                priceDiscount.classList.add('hidden');
            }
        }

        priceRegular.innerText = '$' + newPrice;
    }

    getSellingVariant(variantID) {
        let sellingVariant

        // get selling plan of current variant and set it as the value of the selling sellingVariant variable
        this.product.variants.forEach(function (variant) {
            if (variant.id === variantID) {
                sellingVariant = variant
            }
        })

        return sellingVariant
    }

    getBundleVariant(variantID) {
        let bundleVariant

        // get selling plan of current variant and set it as the value of the selling bundleVariant variable
        this.bundleSettings.variants.forEach(function (variant) {
            if (Number(variant.external_variant_id) === variantID) {
                bundleVariant = variant
            }
        })

        return bundleVariant
    }
}

customElements.define('recharge-bundle-custom', RechargeCustomBundle);