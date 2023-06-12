class RechargeWidget extends HTMLElement {
    constructor() {
        super();
        this.product;
        this.productID;
        this.session;
        this.variantID;
        this.widget;
        this.widgetTemplate;
        this.nextShipment;
        this.initializeWidget();
    }

    async initializeWidget () {
        await this.login();

        this.variantID = Number(document.querySelector('.product-variant-id').value);
        this.productID = document.querySelector('.widget').getAttribute('data-product-id');
        this.variantID = Number(document.querySelector('.product-variant-id').value);
        this.widget = await recharge.cdn.getCDNWidgetSettings(this.productID);
        this.product = await recharge.cdn.getCDNProduct(this.productID);
        this.setVariables(document.querySelector(':root'))


        // if (this.widget.published)  {
            this.widgetTemplate = document.querySelector('.widget__template-radio');
            // check the widget template type and set the widget template variable to the correct template
            switch(this.widget.widget_template_type) {
                case 'radio_group':
                    this.widgetTemplate.classList.add('radio-group');
                    break;
                case 'button_group':
                    this.widgetTemplate.classList.add('button-group');
                    break;
                case 'checkbox':
                    this.widgetTemplate = document.querySelector('.widget__template-checkbox');
                    break;
            }
            this.renderWidget()

            if (this.session) {
                this.getNextShipment()
            }
        // }
    }

    async login() {
        this.session = await recharge.auth.loginShopifyAppProxy();
    }

    async getNextShipment() {
        const subscriptionsObj = await recharge.subscription.listSubscriptions(this.session);
        const subscriptions = subscriptionsObj.subscriptions;
      
        let nextShipmentDate = null,
            sub = null;
      
        subscriptions.forEach((subscription) => {
          if (subscription.next_charge_scheduled_at) {
            const shipmentDate = new Date(subscription.next_charge_scheduled_at);
            if (!nextShipmentDate || shipmentDate < nextShipmentDate) {
                nextShipmentDate = shipmentDate;
                sub = subscription;
            }
          }
        });

        if (nextShipmentDate != null && sub != null) {
            this.renderNextShipment(sub);
        }
    }

    async renderNextShipment(sub) {
        const nextShipmentEl = document.createElement('div');
        const nextDate = window.moment(sub.next_charge_scheduled_at).format('MMMM Do, YYYY');
        nextShipmentEl.classList.add('next-shipment');
        nextShipmentEl.innerHTML += `
            <button class="next-shipment__add button button--primary" data-subscription-id="${sub.id}">Add to next shipment</button>
            <span class="next-shipment__title">Your next shipment is scheduled for ${nextDate}.</span>
        `;

        document.querySelector('.product-form').appendChild(nextShipmentEl);
        document.querySelector('.next-shipment__add').addEventListener('click', this.addToNextShipment.bind(this, sub));

        const nextShipmentObj = await recharge.subscription
    }

    async addToNextShipment(sub) {
        const variantId = document.querySelector('.product__info-container').getAttribute('data-product-variant'),
            productId = document.querySelector('.product__info-container').getAttribute('data-product-id'),
            quantity = sub.quantity + 1;

        if (variantId === sub.external_variant_id.ecommerce && productId === sub.external_product_id.ecommerce) {
            await recharge.subscription.updateSubscription(this.session, sub.id, { quantity: quantity });
        } else {
            await recharge.subscription.createSubscription(this.session, {
                address_id: sub.address_id,
                charge_interval_frequency: sub.charge_interval_frequency,
                next_charge_scheduled_at: sub.next_charge_scheduled_at,
                order_interval_frequency: sub.order_interval_frequency,
                order_interval_unit: sub.order_interval_unit,
                quantity: 1,
                external_variant_id: {
                    ecommerce: variantId
                },
                external_product_id: {
                    ecommerce: productId
                }
            });
        }

        window.location = '/account'
    }

    // Define an async function called renderWidget
    async renderWidget() {

        // Assign several variables by destructuring from the instance object
        let widgetTemplate = this.widgetTemplate,
            variantID = this.variantID,
            widget = this.widget,
            prod = this.product,
            sellingVariant = this.product.variants.find(obj => obj.id === variantID),
            sellingPlan = '',
            priceEl,
            price = sellingVariant.prices.unit_price,
            compareAtPrice = sellingVariant.prices.compare_at_price,
            subscribePrice = sellingVariant.prices.discounted_price;

        // Check if the widget is set to select subscription as the default choice and update the price accordingly
        if (this.widget.select_subscription_first) {
            sellingPlan = sellingVariant.selling_plan_allocations[0].selling_plan_id;
            price = subscribePrice;
        }

        // Determine the correct price element based on whether there is a compare-at price
        if (compareAtPrice) {
            priceEl = document.querySelector('.price__sale .price-item.price-item--sale');
        } else {
            priceEl = document.querySelector('.price__regular .price-item.price-item--regular')
        }

        // Create an input element for the selling plan and add it to the product form
        let sellingPlanInput = document.createElement('input');
        sellingPlanInput.classList.add('selling-plan-input')
        sellingPlanInput.name = 'selling_plan';
        sellingPlanInput.type = 'hidden';
        sellingPlanInput.value = sellingPlan;
        document.querySelector('.product-form form').appendChild(sellingPlanInput)

        // Render radio buttons or checkbox depending on widget template type and product subscription availability
        if (widget.widget_template_type != 'checkbox') {
            if (!prod.is_subscription_only) {
                switch(widget.select_subscription_first) {
                    case true:
                        this.renderSubscriptionRadio(sellingVariant, widgetTemplate);
                        this.renderOneTimeRadio(sellingVariant, widgetTemplate);
                        break;
                    case false:
                        this.renderOneTimeRadio(sellingVariant, widgetTemplate);
                        this.renderSubscriptionRadio(sellingVariant, widgetTemplate);
                        break;
                }
            } else {
                this.renderSubscriptionRadio(sellingVariant, widgetTemplate);
            }
            // Add change event listeners to the variant id input and update the widget when the variant changes
            document.querySelector('.product-variant-id').addEventListener('change', this.updateRadioWidget.bind(this, widgetTemplate));
        } else {
            this.renderSubscriptionCheckbox(sellingVariant, widgetTemplate);
            // Add change event listeners to the variant id input and update the widget when the variant changes
            document.querySelector('.product-variant-id').addEventListener('change', this.updateCheckboxWidget.bind(this, widgetTemplate));
        }

        // Update the product price with the correct price
        this.updatePrice(price, subscribePrice, compareAtPrice);

        // Render subscription details if necessary
        if (widget.show_subscription_details) {
            this.renderDetails();
        }

        // Remove the hidden class from the widget element
        document.querySelector('.widget').classList.remove('hidden');
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

    setVariables(root) {
        root.style.setProperty('--rc-text-color', this.widget.font_color);
        root.style.setProperty('--rc-active-color', this.widget.active_color);
        root.style.setProperty('--rc-background-color', this.widget.background_color);
        root.style.setProperty('--rc-tooltip-background', this.widget.popup_background_color);
        root.style.setProperty('--rc-tooltip-text', this.widget.popup_text_color);
        root.style.setProperty('--rc-tooltip-icon-color', this.widget.widget_icon);
        root.style.setProperty('--rc-widget-link-color', this.widget.popup_link_color);
    }

    // render the subscription radio button
    renderSubscriptionRadio(sellingVariant) {
        let widget = this.widget,
            prod = this.product,
            widgetTemplate = this.widgetTemplate,
            subscribeText = widget.subscribe_without_discount_message,
            price = sellingVariant.prices.unit_price,
            discountedPrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price,
            discount = (price > discountedPrice),
            subscribePrice = price,
            _this = this;

        // if a discount is applied, change the text to the subscribe with discount message and set the price to the discounted price
        if (discount) {
            subscribePrice = discountedPrice;
            subscribeText = widget.subscribe_message;
            widgetTemplate.querySelector('.subscription-radio .option-discount').innerText = prod.selling_plan_groups[0].selling_plans[0].price_adjustments_value + '%'
        }

        // set the text and price of the subscription radio button
        widgetTemplate.querySelector('.subscription-radio .option-text').innerHTML = subscribeText;
        widgetTemplate.querySelector('.subscription-radio .option-price').innerText = '$' + subscribePrice;

        // if the widget is set to select the subscription radio by default, add the active class and check the radio button
        if (widget.widget_template_type === 'radio_group' || widget.widget_template_type === 'button_group') {
            widgetTemplate.appendChild(widgetTemplate.querySelector('.widget__selling-plans'));
            widgetTemplate.querySelector('.widget__selling-plans-dropdown__label').classList.remove('visually-hidden')
        }

        // if the widget is set to select the subscription radio by default, add the active class and check the radio button
        if (widget.select_subscription_first) {
            widgetTemplate.querySelector('.subscription-radio').classList.add('widget-option--active');
            widgetTemplate.querySelector('.subscription-radio .widget__radio-input').checked = true;

            if (widget.widget_template_type === 'radio_group' || widget.widget_template_type === 'button_group') {
                widgetTemplate.querySelector('.widget__selling-plans').style.display = 'block';
            }

            document.querySelector('.widget').setAttribute('data-selected', 'subscription')
            document.querySelector('.price-item.price-item--regular').innerText = '$' + subscribePrice;
        }

        // loop through the variant selling plan allocations selling plans and add them to the dropdown
        sellingVariant.selling_plan_allocations.forEach(function (item) {
            let option = document.createElement('option'),
                planGroup = prod.selling_plan_groups.find(obj => obj.selling_plan_group_id === item.selling_plan_group_id),
                plan = planGroup.selling_plans.find(obj => obj.selling_plan_id === item.selling_plan_id),
                discount = plan.price_adjustments_value + '%';

            // attach necessary data to the option
            option.value = plan.selling_plan_id;
            option.innerText = plan.selling_plan_name;
            option.setAttribute('data-discount', discount);
            option.setAttribute('data-price', item.discounted_price);

            // append the option to the dropdown
            widgetTemplate.querySelector('.widget__selling-plans-dropdown__select').appendChild(option);
        })

        widgetTemplate.querySelector('.widget__selling-plans-dropdown__label').innerText = widget.delivery_dropdown_label;

        if (widget.widget_template_type === 'radio_group') {
            widgetTemplate.appendChild(widgetTemplate.querySelector('.widget__selling-plans'));
        }

        // when selling plan dropdown is changed, update the selling plan input value
        document.querySelector('.widget__selling-plans-dropdown__select').addEventListener('change', function () {
            document.querySelector('.product-form form .selling-plan-input').value = this.value;
        })

        widgetTemplate.querySelector('.subscription-radio .widget__radio-input').addEventListener('change', this.handleSubscriptionChange.bind(this))

        // if there is more than one selling plan, show the dropdown
        if (this.product.selling_plan_groups[0].selling_plans.length > 1) {
            widgetTemplate.querySelector('.widget__selling-plans').classList.remove('hidden');
        }

        widgetTemplate.classList.remove('hidden');
    }

    // handle subscription radio change
    handleSubscriptionChange(ev) {
        if (ev.target.checked) {
            let widgetTemplate = this.widgetTemplate,
                sellingVariant = this.getSellingVariant(Number(document.querySelector('.product-variant-id').value)),
                price = sellingVariant.prices.unit_price,
                compareAtPrice = sellingVariant.prices.compare_at_price,
                subscribePrice = sellingVariant.prices.discounted_price,
                sellingPlan,
                sellingPlanInput = document.querySelector('.product-form form .selling-plan-input');

            //if the widget is set to select the subscription as the default choice, set the selling_plan value to the first selling plan
            if (this.widget.select_subscription_first) {
                sellingPlan = sellingVariant.selling_plan_allocations[0].selling_plan_id;
                price = sellingVariant.prices.discounted_price
            }

            widgetTemplate.querySelector('.widget__radio.widget-option--active').classList.remove('widget-option--active');
            widgetTemplate.querySelector('.widget__radio.subscription-radio').classList.add('widget-option--active');
            sellingPlanInput.value = widgetTemplate.querySelector('.widget__selling-plans-dropdown__select').value;

            document.querySelector('.widget').setAttribute('data-selected', 'subscription')

            this.updatePrice(price, subscribePrice, compareAtPrice);

            if(this.widget.widget_template_type === 'radio_group' || this.widget.widget_template_type === 'button_group') {
                widgetTemplate.querySelector('.widget__selling-plans').style.display = 'block';
            }
        }
    }

    // render the one-time radio button
    renderOneTimeRadio(sellingVariant, widgetTemplate) {
        let widget = this.widget,
            price = sellingVariant.prices.unit_price,
            oneTimeText = widget.onetime_message;

        // set the text and price of the one time radio button
        widgetTemplate.querySelector('.one-time-radio .option-text').innerHTML = oneTimeText;
        widgetTemplate.querySelector('.one-time-radio .option-price').innerText = '$' + price;

        // if the widget is set to not select the subscription radio by default, add the active class and check the radio button
        if (!widget.select_subscription_first) {
            widgetTemplate.querySelector('.one-time-radio').classList.add('widget-option--active');
            widgetTemplate.querySelector('.one-time-radio .widget__radio-input').checked = true;
            document.querySelector('.widget').setAttribute('data-selected', 'one-time');
        }

        // when the one time radio button is clicked, remove the active class from the subscription radio button, update the price, and hide the selling plan dropdown
        widgetTemplate.querySelector('.one-time-radio .widget__radio-input').addEventListener('change', this.handleOneTimeChange.bind(this))
    }

    // handle one-time radio change
    handleOneTimeChange(ev) {
        if (ev.target.checked) {
            let widget = this.widget,
                widgetTemplate = this.widgetTemplate,
                sellingVariant = this.getSellingVariant(Number(document.querySelector('.product-variant-id').value)),
                price = sellingVariant.prices.unit_price,
                compareAtPrice = sellingVariant.prices.compare_at_price,
                sellingPlanInput = document.querySelector('.product-form form .selling-plan-input');

            sellingPlanInput.value = '';
            document.querySelector('.widget').setAttribute('data-selected', 'one-time')
            widgetTemplate.querySelector('.widget__radio.widget-option--active').classList.remove('widget-option--active');
            widgetTemplate.querySelector('.widget__radio.one-time-radio').classList.add('widget-option--active');

            this.updatePrice(price, null, compareAtPrice);

            if(widget.widget_template_type === 'radio_group' || widget.widget_template_type === 'button_group') {
                widgetTemplate.querySelector('.widget__selling-plans').classList.add('hidden');
            }
        }
    }

    // update radios
    updateRadioWidget() {
        let prod =  this.product,
            variantID = Number(document.querySelector('.product-variant-id').value),
            sellingVariant = this.getSellingVariant(variantID),
            priceContainer = document.querySelector('.price'),
            price = sellingVariant.prices.unit_price,
            subscribePrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price,
            widgetTemplate = this.widgetTemplate,
            subscriptionRadio = widgetTemplate.querySelector('.subscription-radio .widget__radio-input'),
            oneTimeRadio = widgetTemplate.querySelector('.one-time-radio .widget__radio-input'),
            sellingPlanInput = document.querySelector('.product-form form .selling-plan-input'),
            sellingPlanSelect = widgetTemplate.querySelector('.widget__selling-plans-dropdown__select');


        // add recharge-price-modifier class to the price element so that the theme does not update it on variant change.
        // the related js change was added within the renderProductInfo function of global.js
        priceContainer.classList.add('recharge-price-modifier');

        // clear the subscription options from the plan dropdown
        sellingPlanSelect.innerHTML = ''

        // loop through the selling_plan_allocations of the variant and add them to the dropdown
        sellingVariant.selling_plan_allocations.forEach(function (item, i) {
            let option = document.createElement('option'),
                planGroup =  prod.selling_plan_groups.find(obj => obj.selling_plan_group_id === item.selling_plan_group_id),
                plan = planGroup.selling_plans.find(obj => obj.selling_plan_id === item.selling_plan_id),
                discount = plan.price_adjustments_value + '%';

            // set subscription radio price and subscribePrice variable to the first plan price
            if (i === 0) {
                // set the subscribePrice variable to the price of the first plan
                subscribePrice = item.discounted_price;
                widgetTemplate.querySelector('.subscription-radio .option-price').innerHTML = '$' + subscribePrice;
            }

            // attach necessary data to the option
            option.value = plan.selling_plan_id;
            option.innerText = plan.selling_plan_name;
            option.setAttribute('data-discount', discount);
            option.setAttribute('data-price', subscribePrice);

            // append the option to the dropdown
            sellingPlanSelect.appendChild(option);
        })

        // update the one-time radio price with the default variant price if the product is not subscription only
        if (!prod.is_subscription_only) {
            widgetTemplate.querySelector('.one-time-radio .option-price').innerHTML = '$' + sellingVariant.prices.unit_price;
            switch (document.querySelector('.widget').getAttribute('data-selected')) {
                case 'subscription':
                    sellingPlanInput.value = sellingPlanSelect.value;
                    break;
                case 'one-time':
                    sellingPlanInput.value = '';
                    break;
            }
        } else {
            sellingPlanInput.value = sellingPlanSelect.value;
        }

        // update the radio event listeners
        subscriptionRadio.removeEventListener('change', this.handleSubscriptionChange.bind(this))
        subscriptionRadio.addEventListener('change', this.handleSubscriptionChange.bind(this))

        // update the radio event listeners
        if (!prod.is_subscription_only) {
            oneTimeRadio.removeEventListener('change', this.handleOneTimeChange.bind(this))
            oneTimeRadio.addEventListener('change', this.handleOneTimeChange.bind(this))
        }

        this.updatePrice(price, subscribePrice, compareAtPrice);
    }

    // updates the price when the variant or selling plan is changed
    updatePrice(price, subscribePrice, compareAtPrice) {
        let selected = document.querySelector('.widget').getAttribute('data-selected'),
            priceContainer = document.querySelector('.product__info-wrapper'),
            priceEl,
            newPrice;

        if (selected === 'one-time') {
            newPrice = price;
        } else if (selected === 'subscription') {
            newPrice = subscribePrice;
        }

        if (compareAtPrice != null ) {
            priceContainer.querySelector('.price').classList.add('price--on-sale')
            priceEl = priceContainer.querySelector('.price__sale .price-item.price-item--sale');
            priceContainer.querySelector('.price__sale .price-item.price-item--regular').innerText = '$' + compareAtPrice
        } else {
            priceContainer.querySelector('.price').classList.remove('price--on-sale');
            priceEl = priceContainer.querySelector('.price__regular .price-item.price-item--regular');
        }

        priceEl.innerText = '$' + newPrice;
    }

    // renders the subscription checkbox option
    renderSubscriptionCheckbox(sellingVariant, widgetTemplate) {
        let widget = this.widget,
            prod = this.product,
            checkbox = widgetTemplate.querySelector('.widget__checkbox-input'),
            priceContainer = document.querySelector('.product__info-wrapper'),
            priceEl,
            price = sellingVariant.prices.unit_price,
            newPrice,
            subscribePrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price,
            sellingPlanLabel = widgetTemplate.querySelector('.widget__selling-plans-dropdown__label'),
            sellingPlanSelect = widgetTemplate.querySelector('.widget__selling-plans-dropdown__select'),
            sellingPlanInput = document.querySelector('.product-form form .selling-plan-input');

        widgetTemplate.querySelector('.option-text').innerHTML = widget.subscribe_message;
        widgetTemplate.querySelector('.option-discount').innerText = prod.selling_plan_groups[0].selling_plans[0].price_adjustments_value + '%';
        widgetTemplate.querySelector('.option-sub').innerText = widget.sub_and_save_ext_label;

        sellingPlanLabel.innerText = widget.delivery_dropdown_label;
        sellingPlanLabel.classList.remove('visually-hidden');

        sellingVariant.selling_plan_allocations.forEach(function (item) {
            let option = document.createElement('option'),
                planGroup = prod.selling_plan_groups.find(obj => obj.selling_plan_group_id === item.selling_plan_group_id),
                plan = planGroup.selling_plans.find(obj => obj.selling_plan_id === item.selling_plan_id),
                discount = plan.price_adjustments_value + '%';

            // attach necessary data to the option
            option.value = plan.selling_plan_id;
            option.innerText = plan.selling_plan_name;
            option.setAttribute('data-discount', discount);
            option.setAttribute('data-price', item.discounted_price);

            // append the option to the dropdown
            widgetTemplate.querySelector('.widget__selling-plans-dropdown__select').appendChild(option);
        })

        if (compareAtPrice != null ) {
            priceContainer.querySelector('.price').classList.add('price--on-sale')
            priceEl = priceContainer.querySelector('.price__sale .price-item.price-item--sale');
            priceContainer.querySelector('.price__sale .price-item.price-item--regular').innerText = '$' + compareAtPrice
        } else {
            priceContainer.querySelector('.price').classList.remove('price--on-sale');
            priceEl = priceContainer.querySelector('.price__regular .price-item.price-item--regular');
        }

        // set the checkbox to be checked
        if (this.widget.select_subscription_first) {
            checkbox.checked = true;
            newPrice = subscribePrice;
            widgetTemplate.querySelector('.widget__selling-plans').classList.remove('hidden');
            document.querySelector('.widget').setAttribute('data-selected', 'subscription');
        } else {
            document.querySelector('.widget').setAttribute('data-selected', 'subscription');
        }

        checkbox.addEventListener('change', this.handleCheckboxChange.bind(this));
        sellingPlanSelect.addEventListener('change', function (e) {
            sellingPlanInput.value = e.target.value
        })

        widgetTemplate.classList.remove('hidden');
    }

    handleCheckboxChange(ev) {
        let widget = this.widget,
            widgetTemplate = this.widgetTemplate,
            sellingVariant = this.getSellingVariant(Number(document.querySelector('.product-variant-id').value)),
            price = sellingVariant.prices.unit_price,
            subscribePrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price,
            sellingPlanInput = document.querySelector('.product-form form .selling-plan-input'),
            sellingPlanSelect = widgetTemplate.querySelector('.widget__selling-plans-dropdown__select');

        if (ev.target.checked) {
            sellingPlanInput.value = sellingPlanSelect.value;
            document.querySelector('.widget').setAttribute('data-selected', 'subscription')
            widgetTemplate.querySelector('.widget__selling-plans').classList.remove('hidden');

        } else {
            sellingPlanInput.value = '';
            document.querySelector('.widget').setAttribute('data-selected', 'one-time')
            widgetTemplate.querySelector('.widget__selling-plans').classList.add('hidden');
        }

        this.updatePrice(price, subscribePrice, compareAtPrice);
    }

    updateCheckboxWidget () {
        let widget = this.widget,
            prod = this.product,
            widgetTemplate = this.widgetTemplate,
            variantID = Number(document.querySelector('.product-variant-id').value),
            sellingVariant = this.getSellingVariant(variantID),
            checkbox = widgetTemplate.querySelector('.widget__checkbox-input'),
            priceContainer = document.querySelector('.product__info-wrapper'),
            priceEl,
            price = sellingVariant.prices.unit_price,
            newPrice,
            subscribePrice = sellingVariant.prices.discounted_price,
            compareAtPrice = sellingVariant.prices.compare_at_price,
            sellingPlanSelect = widgetTemplate.querySelector('.widget__selling-plans-dropdown__select'),
            sellingPlanInput = document.querySelector('.product-form form .selling-plan-input');

        document.querySelector('.price').classList.add('recharge-price-modifier');

        // clear the subscription options from the plan dropdown
        sellingPlanSelect.innerHTML = ''

        // loop through the selling_plan_allocations of the variant and add them to the dropdown
        sellingVariant.selling_plan_allocations.forEach(function (item, i) {
            let option = document.createElement('option'),
                planGroup =  prod.selling_plan_groups.find(obj => obj.selling_plan_group_id === item.selling_plan_group_id),
                plan = planGroup.selling_plans.find(obj => obj.selling_plan_id === item.selling_plan_id),
                discount = plan.price_adjustments_value + '%';

            // set subscription radio price and subscribePrice variable to the first plan price
            if (i === 0) {
                // set the subscribePrice variable to the price of the first plan
                subscribePrice = item.discounted_price;
            }

            // attach necessary data to the option
            option.value = plan.selling_plan_id;
            option.innerText = plan.selling_plan_name;
            option.setAttribute('data-discount', discount);
            option.setAttribute('data-price', subscribePrice);

            // append the option to the dropdown
            sellingPlanSelect.appendChild(option);
        })

        switch (document.querySelector('.widget').getAttribute('data-selected')) {
            case 'subscription':
                sellingPlanInput.value = sellingPlanSelect.value;
                break;
            case 'one-time':
                sellingPlanInput.value = '';
                break;
        }

        checkbox.removeEventListener('change', this.handleCheckboxChange.bind(this));
        checkbox.addEventListener('change', this.handleCheckboxChange.bind(this));

        this.updatePrice(price, subscribePrice, compareAtPrice)
    }

    // renders the subscription details section
    renderDetails() {
        if (this.widget.show_subscription_details) {
            let learnMore = document.querySelector('.widget .learn-more');

            document.querySelector('.widget__subscription-details__text').innerText = this.widget.subscription_details_verbiage;
            document.querySelector('.how-it-works__title').innerHTML = this.widget.how_it_works;

            if (this.widget.show_learnmore) {
                learnMore.classList.remove('hidden');
                learnMore.href = this.widget.learnmore_url;
                learnMore.innerText = this.widget.learnmore_verbiage;
            }

            document.querySelector('.widget__subscription-details').classList.remove('hidden');
            document.querySelector('.widget__tooltip-footer').classList.remove('hidden');
        }
    }
}
customElements.define('recharge-widget', RechargeWidget);
